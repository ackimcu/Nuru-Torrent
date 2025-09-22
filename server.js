const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const WebTorrent = require('webtorrent');
const cors = require('cors');
const path = require('path');

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
  
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (imageExts.includes(ext)) return 'image';
  if (documentExts.includes(ext)) return 'document';
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
  
  for (let i = startPiece; i <= endPiece; i++) {
    if (i < torrent.pieces.length && torrent.pieces[i] && torrent.pieces[i].done) {
      downloadedPieces++;
    }
  }
  
  return totalPieces > 0 ? downloadedPieces / totalPieces : 0;
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
      prioritize: true
    }, (torrent) => {
      console.log('Torrent added:', torrent.name);
      
      // Find video files
      const videoFiles = torrent.files.filter(file => 
        file.name.match(/\.(mp4|avi|mkv|mov|wmv|flv|webm|m4v)$/i)
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
    'rtf': 'application/rtf'
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}

// API endpoint to remove torrent
app.delete('/api/torrent/:infoHash', (req, res) => {
  const { infoHash } = req.params;
  const torrentData = activeTorrents.get(infoHash);
  
  if (torrentData) {
    client.remove(torrentData.torrent);
    activeTorrents.delete(infoHash);
    res.json({ success: true, message: 'Torrent removed' });
  } else {
    res.status(404).json({ error: 'Torrent not found' });
  }
});

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Nuru Torrent Streamer running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
