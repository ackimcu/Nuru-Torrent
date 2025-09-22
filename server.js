const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const WebTorrent = require('webtorrent');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// WebTorrent client with optimizations for low seeders
const client = new WebTorrent({
  // Increase connection limits for better peer discovery
  maxConns: 200,
  maxConnsPerTorrent: 50,
  
  // Optimize for streaming
  dht: true,
  tracker: true,
  lsd: true,
  
  // Increase piece timeout for slow connections
  pieceTimeout: 30000,
  
  // Optimize for sequential downloading
  strategy: 'sequential',
  
  // Increase retry attempts
  retries: 10,
  
  // Optimize for low bandwidth
  maxWebConns: 50,
  
  // Enable UPnP for better connectivity
  upnp: true,
  
  // Increase announce interval for better peer discovery
  announce: 30000,
  
  // Optimize for streaming video
  preload: true,
  
  // Increase buffer size for smoother playback
  bufferSize: 64 * 1024 * 1024, // 64MB buffer
  
  // Set download directory to hidden temp folder for streaming only
  downloadPath: path.join(require('os').tmpdir(), '.nuru-torrent-temp')
});

// Store active torrents
const activeTorrents = new Map();

// Track currently playing video for dynamic prioritization
let currentlyPlayingVideo = null;

// Enhanced peer management and connection pooling
const peerManager = {
  maxConnections: 200,
  maxConnectionsPerTorrent: 50,
  connectionTimeout: 30000,
  retryDelay: 5000,
  
  // Track connection health
  connectionHealth: new Map(),
  
  // Optimize connections for low seeder scenarios
  optimizeForLowSeeders(torrent) {
    if (torrent.numSeeders < 3) {
      // Increase connection attempts for low seeder scenarios
      torrent.maxConns = Math.min(100, torrent.numPeers * 2);
      torrent.maxConnsPerTorrent = Math.min(25, torrent.numPeers);
      
      // Increase piece timeout for slow connections
      torrent.pieceTimeout = 60000;
      
      // Enable more aggressive peer discovery
      torrent.dht = true;
      torrent.tracker = true;
      torrent.lsd = true;
      
      console.log(`Optimized torrent ${torrent.name} for low seeders (${torrent.numSeeders} seeders)`);
    }
  },
  
  // Monitor connection health
  monitorConnectionHealth(torrent) {
    const healthKey = torrent.infoHash;
    const now = Date.now();
    
    if (!this.connectionHealth.has(healthKey)) {
      this.connectionHealth.set(healthKey, {
        lastUpdate: now,
        connectionCount: 0,
        downloadSpeed: 0,
        healthScore: 1.0
      });
    }
    
    const health = this.connectionHealth.get(healthKey);
    const timeDiff = now - health.lastUpdate;
    
    // Update health metrics
    health.connectionCount = torrent.numPeers;
    health.downloadSpeed = torrent.downloadSpeed;
    health.lastUpdate = now;
    
    // Calculate health score based on multiple factors
    const speedScore = Math.min(1.0, torrent.downloadSpeed / (1024 * 1024)); // Normalize to 1MB/s
    const peerScore = Math.min(1.0, torrent.numPeers / 10); // Normalize to 10 peers
    const seederScore = Math.min(1.0, torrent.numSeeders / 5); // Normalize to 5 seeders
    
    health.healthScore = (speedScore + peerScore + seederScore) / 3;
    
    return health;
  }
};

// Helper function to determine file type
function getFileType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const videoExts = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v'];
  const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'];
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
  const documentExts = ['pdf', 'txt', 'doc', 'docx', 'rtf'];
  const captionExts = ['srt', 'vtt', 'ass', 'ssa', 'sub', 'idx'];
  
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (imageExts.includes(ext)) return 'image';
  if (documentExts.includes(ext)) return 'document';
  if (captionExts.includes(ext)) return 'caption';
  return 'other';
}

// Dynamic piece prioritization based on currently playing video
function updatePiecePriorities() {
  activeTorrents.forEach((torrentData, infoHash) => {
    const { torrent, mainVideoFile } = torrentData;
    if (!torrent.pieces || !mainVideoFile) return;
    
    const pieceLength = torrent.pieceLength;
    const fileStart = mainVideoFile.offset;
    const fileEnd = mainVideoFile.offset + mainVideoFile.length;
    const startPiece = Math.floor(fileStart / pieceLength);
    const endPiece = Math.floor(fileEnd / pieceLength);
    
    // Check if this is the currently playing video
    const isCurrentlyPlaying = currentlyPlayingVideo === infoHash;
    
    for (let i = startPiece; i <= endPiece; i++) {
      if (i < torrent.pieces.length && torrent.pieces[i]) {
        if (isCurrentlyPlaying) {
          // Full priority for currently playing video
          torrent.pieces[i].priority = 3;
          
          // Extra priority for the first 20% for quick start
          if (i < startPiece + Math.ceil((endPiece - startPiece) * 0.2)) {
            torrent.pieces[i].priority = 4;
          }
        } else {
          // Normal priority for non-playing videos
          torrent.pieces[i].priority = 1;
        }
      }
    }
    
    // Set all other pieces to low priority when video is playing
    if (isCurrentlyPlaying) {
      for (let i = 0; i < torrent.pieces.length; i++) {
        if (i < startPiece || i > endPiece) {
          if (torrent.pieces[i]) {
            torrent.pieces[i].priority = 0;
          }
        }
      }
    }
  });
}

// Set currently playing video and update priorities
function setCurrentlyPlayingVideo(infoHash) {
  currentlyPlayingVideo = infoHash;
  updatePiecePriorities();
  
  if (infoHash) {
    const torrentData = activeTorrents.get(infoHash);
    if (torrentData) {
      console.log(`🎬 Prioritizing video: ${torrentData.name}`);
    }
  } else {
    console.log('🎬 No video playing - returning to normal priorities');
  }
}

// Intelligent piece prioritization for video files (initial setup)
function prioritizeVideoPieces(torrent, videoFile) {
  if (!videoFile || !torrent.pieces) return;
  
  const pieceLength = torrent.pieceLength;
  const fileStart = videoFile.offset;
  const fileEnd = videoFile.offset + videoFile.length;
  
  // Calculate which pieces contain the video file
  const startPiece = Math.floor(fileStart / pieceLength);
  const endPiece = Math.floor(fileEnd / pieceLength);
  
  // Set normal priority initially
  for (let i = startPiece; i <= endPiece; i++) {
    if (i < torrent.pieces.length && torrent.pieces[i]) {
      torrent.pieces[i].priority = 1;
    }
  }
  
  console.log(`Initialized ${endPiece - startPiece + 1} pieces for video file: ${videoFile.name}`);
}

// Enhanced buffer monitoring and health calculation
function calculateBufferHealth(torrent, videoFile) {
  if (!videoFile || !torrent.pieces) return 0;
  
  const pieceLength = torrent.pieceLength;
  const fileStart = videoFile.offset;
  const fileEnd = videoFile.offset + videoFile.length;
  const startPiece = Math.floor(fileStart / pieceLength);
  const endPiece = Math.floor(fileEnd / pieceLength);
  
  let downloadedPieces = 0;
  let totalPieces = endPiece - startPiece + 1;
  
  // Debug logging (minimal)
  if (downloadedPieces === 0 && torrent.progress > 0.5) {
    console.log(`Buffer calculation issue for ${videoFile.name}: ${downloadedPieces}/${totalPieces} pieces`);
  }
  
  // Use torrent progress as the primary source of truth for buffer health
  // This ensures consistency between overall progress and buffer health
  const estimatedDownloadedPieces = Math.floor(torrent.progress * totalPieces);
  
  // Try to detect actual downloaded pieces, but cap it at the torrent progress
  let detectedDownloadedPieces = 0;
  
  for (let i = startPiece; i <= endPiece; i++) {
    if (i < torrent.pieces.length && torrent.pieces[i]) {
      // Method 1: Check if piece is done
      if (torrent.pieces[i].done) {
        detectedDownloadedPieces++;
        continue;
      }
      
      // Method 2: Check if piece is downloaded
      if (torrent.pieces[i].downloaded) {
        detectedDownloadedPieces++;
        continue;
      }
      
      // Method 3: Check if piece exists and has data
      if (torrent.pieces[i].length > 0) {
        detectedDownloadedPieces++;
        continue;
      }
      
      // Method 4: Check piece status using different properties
      if (torrent.pieces[i].status === 'done' || torrent.pieces[i].status === 'downloaded') {
        detectedDownloadedPieces++;
        continue;
      }
    }
  }
  
  // Use the minimum of detected pieces and estimated pieces to prevent over-reporting
  downloadedPieces = Math.min(detectedDownloadedPieces, estimatedDownloadedPieces);
  
  // If no pieces detected but torrent has progress, use the estimated value
  if (detectedDownloadedPieces === 0 && torrent.progress > 0) {
    downloadedPieces = estimatedDownloadedPieces;
    console.log(`Using torrent progress estimation: ${downloadedPieces} pieces from ${torrent.progress} progress`);
  }
  
  const bufferHealth = totalPieces > 0 ? downloadedPieces / totalPieces : 0;
  
  // Debug logging (minimal)
  if (bufferHealth > 0.9 && torrent.progress < 0.1) {
    console.log(`Buffer health inconsistency: ${(bufferHealth * 100).toFixed(1)}% buffer vs ${(torrent.progress * 100).toFixed(1)}% progress`);
  }
  
  return bufferHealth;
}

// Adaptive streaming quality based on connection speed
function getAdaptiveQuality(downloadSpeed, fileSize) {
  const speedMBps = downloadSpeed / (1024 * 1024);
  
  if (speedMBps > 10) return 'high';
  if (speedMBps > 5) return 'medium';
  if (speedMBps > 1) return 'low';
  return 'very-low';
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to add torrent
app.post('/api/torrent', (req, res) => {
  const { magnetLink } = req.body;
  
  if (!magnetLink) {
    return res.status(400).json({ error: 'Magnet link is required' });
  }

  try {
    // Add torrent to WebTorrent client with optimizations
    const torrent = client.add(magnetLink, {
      // Prioritize sequential downloading for streaming
      strategy: 'sequential',
      
      // Increase piece priority for video files
      priority: 1,
      
      // Enable preloading for better buffering
      preload: true,
      
      // Optimize for streaming
      sequential: true,
      
      // Increase piece size for better performance
      pieceLength: 256 * 1024, // 256KB pieces
      
      // Enable piece prioritization
      prioritize: true,
      
      // Set download path for this specific torrent (hidden temp folder)
      path: path.join(require('os').tmpdir(), '.nuru-torrent-temp', 'torrent-' + Date.now())
    }, (torrent) => {
      console.log('Torrent added:', torrent.name);
      console.log('Torrent download path:', torrent.path);
      console.log('Torrent infoHash:', torrent.infoHash);
      
      // Find video files
      const videoFiles = torrent.files.filter(file => 
        file.name.match(/\.(mp4|avi|mkv|mov|wmv|flv|webm|m4v)$/i)
      );

      // Find caption files
      const captionFiles = torrent.files.filter(file => 
        file.name.match(/\.(srt|vtt|ass|ssa|sub|idx)$/i)
      );

      if (videoFiles.length > 0) {
        // Prioritize the largest video file
        const mainVideoFile = videoFiles.reduce((prev, current) => 
          (prev.length > current.length) ? prev : current
        );
        
        // Apply intelligent piece prioritization for video files
        prioritizeVideoPieces(torrent, mainVideoFile);
        
        // Create readable stream with optimizations
        const stream = mainVideoFile.createReadStream({
          // Enable high water mark for better buffering
          highWaterMark: 1024 * 1024, // 1MB buffer
          
          // Enable auto-destroy for memory management
          autoDestroy: true,
          
          // Enable object mode for better performance
          objectMode: false
        });
        
        // Store torrent info with enhanced metadata
        activeTorrents.set(torrent.infoHash, {
          torrent,
          mainVideoFile,
          stream,
          captionFiles,
          name: torrent.name,
          progress: 0,
          downloadSpeed: 0,
          uploadSpeed: 0,
          peers: 0,
          seeders: 0,
          leechers: 0,
          bufferHealth: 0,
          files: torrent.files.map(file => ({
            name: file.name,
            length: file.length,
            type: getFileType(file.name)
          }))
        });

        // Emit torrent ready event
        io.emit('torrentReady', {
          infoHash: torrent.infoHash,
          name: torrent.name,
          size: torrent.length,
          videoFile: {
            name: mainVideoFile.name,
            length: mainVideoFile.length
          },
          captionFiles: captionFiles.map(file => ({
            name: file.name,
            length: file.length,
            type: getFileType(file.name)
          })),
          files: torrent.files.map(file => ({
            name: file.name,
            length: file.length,
            type: getFileType(file.name)
          }))
        });
      }
    });

    // Handle torrent progress with enhanced monitoring
    torrent.on('download', () => {
      const torrentData = activeTorrents.get(torrent.infoHash);
      if (torrentData) {
        // Optimize for low seeders
        peerManager.optimizeForLowSeeders(torrent);
        
        // Monitor connection health
        const connectionHealth = peerManager.monitorConnectionHealth(torrent);
        
        torrentData.progress = torrent.progress;
        torrentData.downloadSpeed = torrent.downloadSpeed;
        torrentData.uploadSpeed = torrent.uploadSpeed;
        torrentData.peers = torrent.numPeers;
        torrentData.seeders = torrent.numSeeders;
        torrentData.leechers = torrent.numLeechers;
        torrentData.bufferHealth = calculateBufferHealth(torrent, torrentData.mainVideoFile);
        torrentData.connectionHealth = connectionHealth.healthScore;
        
        // Calculate adaptive quality
        const adaptiveQuality = getAdaptiveQuality(torrent.downloadSpeed, torrentData.mainVideoFile.length);
        
        // Debug logging for progress updates (minimal)
        if (torrent.progress > 0.95) {
          console.log(`Torrent completed: ${torrent.name}`);
        }
        
        io.emit('torrentProgress', {
          infoHash: torrent.infoHash,
          progress: torrent.progress,
          downloadSpeed: torrent.downloadSpeed,
          uploadSpeed: torrent.uploadSpeed,
          peers: torrent.numPeers,
          seeders: torrent.numSeeders,
          leechers: torrent.numLeechers,
          bufferHealth: torrentData.bufferHealth,
          connectionHealth: connectionHealth.healthScore,
          adaptiveQuality: adaptiveQuality,
          isLowSeeder: torrent.numSeeders < 3
        });
      }
    });

    // Handle torrent errors
    torrent.on('error', (err) => {
      console.error('Torrent error:', err);
      io.emit('torrentError', {
        infoHash: torrent.infoHash,
        error: err.message
      });
    });

    res.json({ 
      success: true, 
      infoHash: torrent.infoHash,
      message: 'Torrent added successfully' 
    });

  } catch (error) {
    console.error('Error adding torrent:', error);
    res.status(500).json({ error: 'Failed to add torrent' });
  }
});

// API endpoint to get torrent files
app.get('/api/torrent/:infoHash/files', (req, res) => {
  const { infoHash } = req.params;
  const torrentData = activeTorrents.get(infoHash);
  
  if (!torrentData) {
    return res.status(404).json({ error: 'Torrent not found' });
  }

  res.json({ files: torrentData.files });
});

// API endpoint to set currently playing video
app.post('/api/playing/:infoHash', (req, res) => {
  const { infoHash } = req.params;
  const torrentData = activeTorrents.get(infoHash);
  
  if (!torrentData) {
    return res.status(404).json({ error: 'Torrent not found' });
  }

  setCurrentlyPlayingVideo(infoHash);
  res.json({ success: true, message: 'Video prioritization updated' });
});

// API endpoint to stop video prioritization
app.post('/api/playing/stop', (req, res) => {
  setCurrentlyPlayingVideo(null);
  res.json({ success: true, message: 'Video prioritization stopped' });
});

// API endpoint to get torrent stream with enhanced buffering
app.get('/api/stream/:infoHash', (req, res) => {
  const { infoHash } = req.params;
  const torrentData = activeTorrents.get(infoHash);
  
  if (!torrentData) {
    return res.status(404).json({ error: 'Torrent not found' });
  }

  const { mainVideoFile, torrent } = torrentData;
  const range = req.headers.range;
  
  // Handle client disconnect
  req.on('close', () => {
    console.log('Client disconnected from stream');
  });
  
  // Enhanced streaming with better buffering
  const streamOptions = {
    // Increase buffer size for better performance
    highWaterMark: 2 * 1024 * 1024, // 2MB buffer
    
    // Enable auto-destroy for memory management
    autoDestroy: true,
    
    // Optimize for streaming
    objectMode: false
  };
  
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : mainVideoFile.length - 1;
    const chunksize = (end - start) + 1;
    
    // Add cache headers for better performance
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${mainVideoFile.length}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
      'Cache-Control': 'public, max-age=3600',
      'ETag': `"${infoHash}-${start}-${end}"`,
      'X-Buffer-Health': torrentData.bufferHealth.toFixed(2),
      'X-Adaptive-Quality': getAdaptiveQuality(torrent.downloadSpeed, mainVideoFile.length)
    });
    
    const stream = mainVideoFile.createReadStream({ 
      start, 
      end,
      ...streamOptions
    });
    
    stream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
    
    // Add backpressure handling for better performance
    stream.on('data', (chunk) => {
      if (!res.write(chunk)) {
        stream.pause();
        res.once('drain', () => stream.resume());
      }
    });
    
    stream.on('end', () => {
      res.end();
    });
    
  } else {
    res.writeHead(200, {
      'Content-Length': mainVideoFile.length,
      'Content-Type': 'video/mp4',
      'Cache-Control': 'public, max-age=3600',
      'ETag': `"${infoHash}-full"`,
      'X-Buffer-Health': torrentData.bufferHealth.toFixed(2),
      'X-Adaptive-Quality': getAdaptiveQuality(torrent.downloadSpeed, mainVideoFile.length)
    });
    
    const stream = mainVideoFile.createReadStream(streamOptions);
    
    stream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
    
    // Add backpressure handling for better performance
    stream.on('data', (chunk) => {
      if (!res.write(chunk)) {
        stream.pause();
        res.once('drain', () => stream.resume());
      }
    });
    
    stream.on('end', () => {
      res.end();
    });
  }
});

// API endpoint to stream individual file
app.get('/api/stream/:infoHash/file/:fileIndex', (req, res) => {
  const { infoHash, fileIndex } = req.params;
  const torrentData = activeTorrents.get(infoHash);
  
  if (!torrentData) {
    return res.status(404).json({ error: 'Torrent not found' });
  }

  const fileIndexNum = parseInt(fileIndex);
  if (isNaN(fileIndexNum) || fileIndexNum < 0 || fileIndexNum >= torrentData.torrent.files.length) {
    return res.status(404).json({ error: 'File not found' });
  }

  const file = torrentData.torrent.files[fileIndexNum];
  const range = req.headers.range;
  
  // Handle client disconnect
  req.on('close', () => {
    console.log('Client disconnected from file stream');
  });
  
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
    const chunksize = (end - start) + 1;
    
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${file.length}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': getContentType(file.name)
    });
    
    const stream = file.createReadStream({ start, end });
    
    stream.on('error', (err) => {
      console.error('File stream error:', err);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
    
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': file.length,
      'Content-Type': getContentType(file.name)
    });
    
    const stream = file.createReadStream();
    
    stream.on('error', (err) => {
      console.error('File stream error:', err);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
    
    stream.pipe(res);
  }
});

// API endpoint to get caption files for a torrent
app.get('/api/torrent/:infoHash/captions', (req, res) => {
  const { infoHash } = req.params;
  const torrentData = activeTorrents.get(infoHash);
  
  if (!torrentData) {
    return res.status(404).json({ error: 'Torrent not found' });
  }

  res.json({ 
    captions: torrentData.captionFiles || [],
    hasCaptions: (torrentData.captionFiles && torrentData.captionFiles.length > 0)
  });
});

// API endpoint to stream caption file
app.get('/api/stream/:infoHash/caption/:captionIndex', (req, res) => {
  const { infoHash, captionIndex } = req.params;
  const torrentData = activeTorrents.get(infoHash);
  
  if (!torrentData) {
    return res.status(404).json({ error: 'Torrent not found' });
  }

  const captionIndexNum = parseInt(captionIndex);
  if (isNaN(captionIndexNum) || captionIndexNum < 0 || !torrentData.captionFiles || captionIndexNum >= torrentData.captionFiles.length) {
    return res.status(404).json({ error: 'Caption file not found' });
  }

  const captionFile = torrentData.captionFiles[captionIndexNum];
  
  // Handle client disconnect
  req.on('close', () => {
    console.log('Client disconnected from caption stream');
  });
  
  res.writeHead(200, {
    'Content-Type': getContentType(captionFile.name),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range'
  });
  
  const stream = captionFile.createReadStream();
  
  stream.on('error', (err) => {
    console.error('Caption stream error:', err);
    if (!res.headersSent) {
      res.status(500).end();
    }
  });
  
  stream.pipe(res);
});

// Helper function to get content type
function getContentType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const contentTypes = {
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'webm': 'video/webm',
    'm4v': 'video/x-m4v',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'flac': 'audio/flac',
    'aac': 'audio/aac',
    'ogg': 'audio/ogg',
    'm4a': 'audio/mp4',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'webp': 'image/webp',
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'rtf': 'application/rtf',
    'srt': 'text/plain',
    'vtt': 'text/vtt',
    'ass': 'text/x-ass',
    'ssa': 'text/x-ssa',
    'sub': 'text/x-sub',
    'idx': 'text/x-idx'
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}

// Cache management system for torrent data
const torrentCache = new Map();

// Function to clear all cached data for a specific torrent
function clearTorrentCache(infoHash) {
  console.log(`🧹 Clearing cache for torrent: ${infoHash}`);
  
  try {
    // Clear any cached torrent metadata
    if (torrentCache.has(infoHash)) {
      const cacheData = torrentCache.get(infoHash);
      
      // Clear any cached streams
      if (cacheData.streams) {
        cacheData.streams.forEach(stream => {
          if (stream && typeof stream.destroy === 'function') {
            stream.destroy();
          }
        });
      }
      
      // Clear any cached file data
      if (cacheData.files) {
        cacheData.files.clear();
      }
      
      // Clear any cached progress data
      if (cacheData.progress) {
        cacheData.progress = null;
      }
      
      // Remove from cache
      torrentCache.delete(infoHash);
      console.log(`✅ Cache cleared for torrent: ${infoHash}`);
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log(`🗑️ Garbage collection triggered for torrent: ${infoHash}`);
    }
    
    // Clear any browser cache entries (if running in browser context)
    // This is handled by the client-side code
    
  } catch (error) {
    console.error(`❌ Error clearing cache for torrent ${infoHash}:`, error);
  }
}

// Function to clear all torrent caches (for cleanup on server restart)
function clearAllTorrentCaches() {
  console.log(`🧹 Clearing all torrent caches`);
  
  try {
    torrentCache.forEach((cacheData, infoHash) => {
      clearTorrentCache(infoHash);
    });
    
    torrentCache.clear();
    console.log(`✅ All torrent caches cleared`);
  } catch (error) {
    console.error(`❌ Error clearing all torrent caches:`, error);
  }
}

// Function to delete torrent files from filesystem
async function deleteTorrentFiles(torrent) {
  console.log(`🗑️ Deleting torrent files from filesystem: ${torrent.name}`);
  
  try {
    if (!torrent || !torrent.files) {
      console.log(`⚠️ No files to delete for torrent: ${torrent?.name || 'unknown'}`);
      return;
    }

    // Get the torrent's download path
    const torrentPath = torrent.path || torrent.downloadPath;
    
    if (!torrentPath) {
      console.log(`⚠️ No download path found for torrent: ${torrent.name}`);
      return;
    }

    console.log(`📁 Torrent download path: ${torrentPath}`);

    // Check if the torrent directory exists
    if (fs.existsSync(torrentPath)) {
      console.log(`🗑️ Deleting torrent directory: ${torrentPath}`);
      
      // Delete all files in the torrent directory
      const files = fs.readdirSync(torrentPath);
      for (const file of files) {
        const filePath = path.join(torrentPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          console.log(`📁 Deleting subdirectory: ${filePath}`);
          await deleteDirectory(filePath);
        } else {
          console.log(`📄 Deleting file: ${filePath}`);
          fs.unlinkSync(filePath);
        }
      }
      
      // Remove the torrent directory itself
      fs.rmdirSync(torrentPath);
      console.log(`✅ Torrent directory deleted: ${torrentPath}`);
    } else {
      console.log(`⚠️ Torrent directory not found: ${torrentPath}`);
    }

    // Also try to delete from WebTorrent's temp directory
    const webtorrentTempPath = path.join(require('os').tmpdir(), 'webtorrent', torrent.infoHash);
    if (fs.existsSync(webtorrentTempPath)) {
      console.log(`🗑️ Deleting from WebTorrent temp path: ${webtorrentTempPath}`);
      await deleteDirectory(webtorrentTempPath);
    }

    // Try to delete from our hidden temp directory
    const hiddenTempPath = path.join(require('os').tmpdir(), '.nuru-torrent-temp', torrent.infoHash);
    if (fs.existsSync(hiddenTempPath)) {
      console.log(`🗑️ Deleting from hidden temp path: ${hiddenTempPath}`);
      await deleteDirectory(hiddenTempPath);
    }

    console.log(`✅ File system cleanup completed for torrent: ${torrent.name}`);
    
  } catch (error) {
    console.error(`❌ Error deleting torrent files for ${torrent.name}:`, error);
    throw error;
  }
}

// Helper function to recursively delete a directory
async function deleteDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      await deleteDirectory(filePath);
    } else {
      fs.unlinkSync(filePath);
    }
  }
  
  fs.rmdirSync(dirPath);
}

// API endpoint to remove torrent with comprehensive data cleanup
app.delete('/api/torrent/:infoHash', async (req, res) => {
  const { infoHash } = req.params;
  const torrentData = activeTorrents.get(infoHash);
  
  if (torrentData) {
    console.log(`🗑️ Starting comprehensive cleanup for torrent: ${torrentData.name}`);
    
    try {
      // 1. Remove from WebTorrent client first (this stops all connections)
      console.log(`🔌 Removing torrent from WebTorrent client: ${infoHash}`);
      client.remove(torrentData.torrent);
      
      // 2. Stop the torrent download/upload
      if (torrentData.torrent) {
        console.log(`⏹️ Stopping torrent download/upload for: ${infoHash}`);
        torrentData.torrent.destroy();
      }
      
      // 3. Clear any active streams
      if (torrentData.stream) {
        console.log(`🌊 Destroying active streams for: ${infoHash}`);
        torrentData.stream.destroy();
      }
      
      // 4. Delete torrent files from filesystem
      console.log(`🗑️ Deleting torrent files from filesystem: ${infoHash}`);
      try {
        await deleteTorrentFiles(torrentData.torrent);
        console.log(`✅ File system cleanup completed for: ${infoHash}`);
      } catch (fileError) {
        console.error(`❌ File system cleanup failed for ${infoHash}:`, fileError);
        // Continue with other cleanup even if file deletion fails
      }
      
      // 5. Clear torrent data from memory
      console.log(`🧹 Clearing torrent data from memory: ${infoHash}`);
      activeTorrents.delete(infoHash);
      
      // 6. Clear any cached data related to this torrent
      console.log(`💾 Clearing cached data for: ${infoHash}`);
      clearTorrentCache(infoHash);
      
      // 7. Reset video prioritization if this was the currently playing video
      if (currentlyPlayingVideo === infoHash) {
        console.log(`🎬 Resetting video prioritization for: ${infoHash}`);
        currentlyPlayingVideo = null;
        updatePiecePriorities();
      }
      
      // 8. Clear peer manager health data
      if (peerManager.connectionHealth.has(infoHash)) {
        console.log(`📊 Clearing peer health data for: ${infoHash}`);
        peerManager.connectionHealth.delete(infoHash);
      }
      
      // 9. Notify all connected clients that torrent was removed
      console.log(`📢 Notifying clients of torrent removal: ${infoHash}`);
      io.emit('torrentRemoved', { 
        infoHash,
        torrentName: torrentData.name,
        cleanupComplete: true
      });
      
      console.log(`✅ Comprehensive cleanup completed for torrent: ${torrentData.name}`);
      res.json({ 
        success: true, 
        message: 'Torrent removed and all data cleaned up',
        torrentName: torrentData.name,
        cleanupComplete: true
      });
      
    } catch (error) {
      console.error(`❌ Error during torrent cleanup for ${infoHash}:`, error);
      
      // Even if cleanup fails, still try to remove from WebTorrent client and active torrents
      try {
        client.remove(torrentData.torrent);
      } catch (removeError) {
        console.error(`❌ Error removing torrent from client:`, removeError);
      }
      
      activeTorrents.delete(infoHash);
      
      io.emit('torrentRemoved', { 
        infoHash,
        torrentName: torrentData.name,
        cleanupComplete: false,
        error: error.message
      });
      
      res.json({ 
        success: true, 
        message: 'Torrent removed with partial cleanup',
        torrentName: torrentData.name,
        cleanupComplete: false,
        error: error.message
      });
    }
  } else {
    res.status(404).json({ error: 'Torrent not found' });
  }
});

// API endpoint for health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    activeTorrents: activeTorrents.size
  });
});

// API endpoint to restart server
app.post('/api/restart', (req, res) => {
  console.log('Server restart requested by client');
  
  // Notify all clients about restart
  io.emit('serverRestarting', { message: 'Server is restarting...' });
  
  res.json({ success: true, message: 'Server restart initiated' });
  
  // Give time for response to be sent, then restart
  setTimeout(() => {
    console.log('Restarting server...');
    
    // Execute the restart script
    const { spawn } = require('child_process');
    const path = require('path');
    
    // Start the restart script
    const restartProcess = spawn('node', ['restart-server.js'], {
      cwd: __dirname,
      stdio: 'inherit',
      detached: true
    });
    
    // Detach the restart process so it continues after this process exits
    restartProcess.unref();
    
    console.log('Restart script launched, exiting...');
    
    // Exit the current process
    process.exit(0);
  }, 1000);
});

// Periodic buffer health updates
setInterval(() => {
  activeTorrents.forEach((torrentData, infoHash) => {
    const { torrent } = torrentData;
    if (torrent && torrentData.mainVideoFile) {
      // Update buffer health
      torrentData.bufferHealth = calculateBufferHealth(torrent, torrentData.mainVideoFile);
      
      // Emit progress update if there are connected clients
      if (io.engine.clientsCount > 0) {
        io.emit('torrentProgress', {
          infoHash: torrent.infoHash,
          progress: torrent.progress,
          downloadSpeed: torrent.downloadSpeed,
          uploadSpeed: torrent.uploadSpeed,
          peers: torrent.numPeers,
          seeders: torrent.numSeeders,
          leechers: torrent.numLeechers,
          bufferHealth: torrentData.bufferHealth,
          connectionHealth: torrentData.connectionHealth || 0,
          adaptiveQuality: getAdaptiveQuality(torrent.downloadSpeed, torrentData.mainVideoFile.length),
          isLowSeeder: torrent.numSeeders < 3
        });
      }
    }
  });
}, 2000); // Update every 2 seconds

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current torrents to new client
  const torrents = Array.from(activeTorrents.entries()).map(([infoHash, data]) => ({
    infoHash,
    name: data.name,
    progress: data.progress,
    downloadSpeed: data.downloadSpeed,
    uploadSpeed: data.uploadSpeed,
    files: data.files
  }));
  
  socket.emit('currentTorrents', torrents);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Function to clean up temp directory on server shutdown
async function cleanupTempDirectory() {
  const tempDir = path.join(require('os').tmpdir(), '.nuru-torrent-temp');
  
  try {
    if (fs.existsSync(tempDir)) {
      console.log(`🧹 Cleaning up temp directory: ${tempDir}`);
      
      // Use recursive deletion instead of manual file-by-file deletion
      await deleteDirectory(tempDir);
      console.log(`✅ Temp directory cleaned up: ${tempDir}`);
    }
  } catch (error) {
    console.error(`❌ Error cleaning up temp directory:`, error);
  }
}

// Clean up temp directory on server startup
cleanupTempDirectory().catch(console.error);

// Clean up temp directory on server shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Server shutting down...');
  cleanupTempDirectory().then(() => process.exit(0)).catch(() => process.exit(1));
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Server shutting down...');
  cleanupTempDirectory().then(() => process.exit(0)).catch(() => process.exit(1));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Nuru Torrent Streamer running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
  console.log(`📁 Temp files stored in: ${path.join(require('os').tmpdir(), '.nuru-torrent-temp')}`);
});
