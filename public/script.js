// Global variables
let socket;
let currentTorrent = null;
let activeTorrents = new Map();
let selectedTorrentForFiles = null;

// DOM elements
const magnetInput = document.getElementById('magnetInput');
const addTorrentBtn = document.getElementById('addTorrentBtn');
const videoSection = document.getElementById('videoSection');
const videoPlayer = document.getElementById('videoPlayer');
const videoOverlay = document.getElementById('videoOverlay');
const videoTitle = document.getElementById('videoTitle');
const videoSize = document.getElementById('videoSize');
const videoProgress = document.getElementById('videoProgress');
const torrentList = document.getElementById('torrentList');
const connectionStatus = document.getElementById('connectionStatus');
const connectionText = document.getElementById('connectionText');
const toastContainer = document.getElementById('toastContainer');

// File manager elements
const fileManagerSection = document.getElementById('fileManagerSection');
const openFileManagerBtn = document.getElementById('openFileManager');
const toggleFileManagerBtn = document.getElementById('toggleFileManager');
const torrentSelector = document.getElementById('torrentSelector');
const filePath = document.getElementById('filePath');
const fileList = document.getElementById('fileList');
const refreshFilesBtn = document.getElementById('refreshFiles');

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();
    setupEventListeners();
    updateConnectionStatus(false);
    
    // Update piece priorities every 5 seconds
    setInterval(() => {
        if (currentTorrent) {
            setCurrentlyPlayingVideo(currentTorrent.infoHash);
        }
    }, 5000);
});

// Socket.io connection
function initializeSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
        updateConnectionStatus(true);
        showToast('Connected to server', 'success');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateConnectionStatus(false);
        showToast('Disconnected from server', 'error');
    });
    
    socket.on('torrentReady', (data) => {
        console.log('Torrent ready:', data);
        handleTorrentReady(data);
        showToast(`Torrent ready: ${data.name}`, 'success');
    });
    
    socket.on('torrentProgress', (data) => {
        updateTorrentProgress(data);
    });
    
    socket.on('torrentError', (data) => {
        console.error('Torrent error:', data);
        showToast(`Torrent error: ${data.error}`, 'error');
        updateTorrentProgress(data);
    });
    
    socket.on('currentTorrents', (torrents) => {
        console.log('Current torrents:', torrents);
        torrents.forEach(torrent => {
            activeTorrents.set(torrent.infoHash, torrent);
        });
        updateTorrentList();
        updateTorrentSelector();
    });
}

// Event listeners
function setupEventListeners() {
    addTorrentBtn.addEventListener('click', addTorrent);
    magnetInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTorrent();
        }
    });
    
    // File manager events
    openFileManagerBtn.addEventListener('click', openFileManager);
    toggleFileManagerBtn.addEventListener('click', closeFileManager);
    refreshFilesBtn.addEventListener('click', refreshFiles);
    
    // Video player events
    videoPlayer.addEventListener('loadstart', () => {
        showVideoOverlay('Loading video...');
    });
    
    videoPlayer.addEventListener('canplay', () => {
        hideVideoOverlay();
    });
    
    videoPlayer.addEventListener('play', () => {
        // Video started playing - ensure prioritization is active
        if (currentTorrent) {
            setCurrentlyPlayingVideo(currentTorrent.infoHash);
        }
    });
    
    videoPlayer.addEventListener('pause', () => {
        // Video paused - reduce prioritization
        if (currentTorrent) {
            setCurrentlyPlayingVideo(currentTorrent.infoHash); // Keep some priority
        }
    });
    
    videoPlayer.addEventListener('ended', () => {
        // Video ended - stop prioritization
        stopVideoPrioritization();
    });
    
    videoPlayer.addEventListener('error', (e) => {
        console.error('Video error:', e);
        showVideoOverlay('Error loading video');
        // Stop prioritization on error
        stopVideoPrioritization();
    });
}

// Add torrent function
async function addTorrent() {
    const magnetLink = magnetInput.value.trim();
    
    if (!magnetLink) {
        showToast('Please enter a magnet link', 'warning');
        return;
    }
    
    if (!magnetLink.startsWith('magnet:')) {
        showToast('Please enter a valid magnet link', 'warning');
        return;
    }
    
    addTorrentBtn.disabled = true;
    addTorrentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
    
    try {
        const response = await fetch('/api/torrent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ magnetLink })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Torrent added successfully', 'success');
            magnetInput.value = '';
        } else {
            showToast(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error adding torrent:', error);
        showToast('Failed to add torrent', 'error');
    } finally {
        addTorrentBtn.disabled = false;
        addTorrentBtn.innerHTML = '<i class="fas fa-plus"></i> Add Torrent';
    }
}

// Handle torrent ready
function handleTorrentReady(data) {
    activeTorrents.set(data.infoHash, {
        infoHash: data.infoHash,
        name: data.name,
        size: data.size,
        videoFile: data.videoFile,
        files: data.files || [],
        progress: 0,
        downloadSpeed: 0,
        uploadSpeed: 0
    });
    
    updateTorrentList();
    updateTorrentSelector();
    
    // Auto-play the first video file
    if (!currentTorrent) {
        playTorrent(data.infoHash);
    }
}

// Play torrent
async function playTorrent(infoHash) {
    const torrent = activeTorrents.get(infoHash);
    if (!torrent) return;
    
    currentTorrent = torrent;
    
    // Set this video as currently playing for prioritization
    await setCurrentlyPlayingVideo(infoHash);
    
    // Show video section
    videoSection.style.display = 'block';
    videoSection.scrollIntoView({ behavior: 'smooth' });
    
    // Update video info
    videoTitle.textContent = torrent.name;
    videoSize.textContent = formatFileSize(torrent.videoFile.length);
    
    // Set video source
    const videoUrl = `/api/stream/${infoHash}`;
    videoPlayer.src = videoUrl;
    
    // Show loading overlay
    showVideoOverlay('Loading video...');
}

// Update torrent progress with enhanced buffering info
function updateTorrentProgress(data) {
    const torrent = activeTorrents.get(data.infoHash);
    if (torrent) {
        torrent.progress = data.progress;
        torrent.downloadSpeed = data.downloadSpeed;
        torrent.uploadSpeed = data.uploadSpeed;
        torrent.peers = data.peers || 0;
        torrent.seeders = data.seeders || 0;
        torrent.leechers = data.leechers || 0;
        torrent.bufferHealth = data.bufferHealth || 0;
        torrent.connectionHealth = data.connectionHealth || 0;
        torrent.adaptiveQuality = data.adaptiveQuality || 'medium';
        torrent.isLowSeeder = data.isLowSeeder || false;
        
        updateTorrentList();
        
        // Update video progress if this is the current torrent
        if (currentTorrent && currentTorrent.infoHash === data.infoHash) {
            const bufferPercent = Math.round(data.bufferHealth * 100);
            const progressPercent = Math.round(data.progress * 100);
            const quality = data.adaptiveQuality || 'medium';
            
            let statusText = `${progressPercent}% complete`;
            if (bufferPercent > 0) {
                statusText += ` | ${bufferPercent}% buffered`;
            }
            if (data.isLowSeeder) {
                statusText += ` | Low seeders (${data.seeders})`;
            }
            if (quality !== 'medium') {
                statusText += ` | Quality: ${quality}`;
            }
            
            // Add prioritization indicator
            statusText += ` | 🎬 Prioritized`;
            
            videoProgress.textContent = statusText;
        }
    }
}

// Update torrent list
function updateTorrentList() {
    if (activeTorrents.size === 0) {
        torrentList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-cloud-download-alt"></i>
                <p>No active torrents</p>
                <small>Add a magnet link to start streaming</small>
            </div>
        `;
        return;
    }
    
    const torrentsHTML = Array.from(activeTorrents.values()).map(torrent => `
        <div class="torrent-item ${torrent.isLowSeeder ? 'low-seeder' : ''}">
            <div class="torrent-header">
                <div class="torrent-name">
                    ${torrent.name}
                    ${torrent.isLowSeeder ? '<span class="low-seeder-badge">Low Seeders</span>' : ''}
                </div>
                <div class="torrent-actions">
                    ${torrent.infoHash === currentTorrent?.infoHash ? 
                        '<span class="btn btn-small" style="background: #51cf66; color: white;">Playing</span>' : 
                        `<button class="btn btn-small btn-primary" onclick="playTorrent('${torrent.infoHash}')">
                            <i class="fas fa-play"></i> Play
                        </button>`
                    }
                    <button class="btn btn-small btn-danger" onclick="removeTorrent('${torrent.infoHash}')">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </div>
            </div>
            <div class="torrent-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${torrent.progress * 100}%"></div>
                </div>
                ${torrent.bufferHealth > 0 ? `
                    <div class="buffer-bar">
                        <div class="buffer-fill" style="width: ${torrent.bufferHealth * 100}%"></div>
                    </div>
                ` : ''}
            </div>
            <div class="torrent-stats">
                <span>${Math.round(torrent.progress * 100)}% complete</span>
                ${torrent.bufferHealth > 0 ? `<span>${Math.round(torrent.bufferHealth * 100)}% buffered</span>` : ''}
                <span>↓ ${formatSpeed(torrent.downloadSpeed)}/s</span>
                <span>↑ ${formatSpeed(torrent.uploadSpeed)}/s</span>
                <span>👥 ${torrent.peers || 0} peers</span>
                <span>🌱 ${torrent.seeders || 0} seeders</span>
                ${torrent.adaptiveQuality && torrent.adaptiveQuality !== 'medium' ? 
                    `<span class="quality-badge quality-${torrent.adaptiveQuality}">${torrent.adaptiveQuality}</span>` : ''}
            </div>
        </div>
    `).join('');
    
    torrentList.innerHTML = torrentsHTML;
}

// Remove torrent
async function removeTorrent(infoHash) {
    try {
        const response = await fetch(`/api/torrent/${infoHash}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            activeTorrents.delete(infoHash);
            updateTorrentList();
            
            // If this was the current torrent, hide video section
            if (currentTorrent && currentTorrent.infoHash === infoHash) {
                currentTorrent = null;
                videoSection.style.display = 'none';
            }
            
            // If this was the selected torrent for files, clear selection
            if (selectedTorrentForFiles === infoHash) {
                selectedTorrentForFiles = null;
                fileList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-folder-open"></i>
                        <p>No files to display</p>
                        <small>Select a torrent to browse its files</small>
                    </div>
                `;
            }
            
            updateTorrentSelector();
            showToast('Torrent removed', 'success');
        } else {
            showToast(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error removing torrent:', error);
        showToast('Failed to remove torrent', 'error');
    }
}

// Video overlay functions
function showVideoOverlay(message) {
    videoOverlay.style.display = 'flex';
    videoOverlay.querySelector('p').textContent = message;
}

function hideVideoOverlay() {
    videoOverlay.style.display = 'none';
}

// Connection status
function updateConnectionStatus(connected) {
    if (connected) {
        connectionStatus.classList.add('connected');
        connectionText.textContent = 'Connected';
    } else {
        connectionStatus.classList.remove('connected');
        connectionText.textContent = 'Disconnected';
    }
}

// Utility functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSecond) {
    if (bytesPerSecond === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Toast notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Remove after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Example link filler
function fillExample(magnetLink) {
    magnetInput.value = magnetLink;
    magnetInput.focus();
}

// File Manager Functions
function openFileManager() {
    fileManagerSection.style.display = 'block';
    fileManagerSection.scrollIntoView({ behavior: 'smooth' });
    updateTorrentSelector();
}

function closeFileManager() {
    fileManagerSection.style.display = 'none';
}

function updateTorrentSelector() {
    if (activeTorrents.size === 0) {
        torrentSelector.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-cloud-download-alt"></i>
                <p>No torrents available</p>
                <small>Add a torrent first</small>
            </div>
        `;
        return;
    }
    
    const torrentsHTML = Array.from(activeTorrents.values()).map(torrent => `
        <div class="torrent-selector-item ${selectedTorrentForFiles === torrent.infoHash ? 'active' : ''}" 
             onclick="selectTorrentForFiles('${torrent.infoHash}')">
            <div class="torrent-name">${torrent.name}</div>
            <div class="torrent-file-count">${torrent.files ? torrent.files.length : 0} files</div>
        </div>
    `).join('');
    
    torrentSelector.innerHTML = torrentsHTML;
}

function selectTorrentForFiles(infoHash) {
    selectedTorrentForFiles = infoHash;
    updateTorrentSelector();
    loadFilesForTorrent(infoHash);
}

async function loadFilesForTorrent(infoHash) {
    const torrent = activeTorrents.get(infoHash);
    if (!torrent) return;
    
    filePath.innerHTML = `
        <i class="fas fa-folder"></i>
        <span>${torrent.name}</span>
    `;
    
    if (torrent.files && torrent.files.length > 0) {
        displayFiles(torrent.files, infoHash);
    } else {
        try {
            const response = await fetch(`/api/torrent/${infoHash}/files`);
            const result = await response.json();
            
            if (result.files) {
                torrent.files = result.files;
                displayFiles(result.files, infoHash);
            }
        } catch (error) {
            console.error('Error loading files:', error);
            showToast('Failed to load files', 'error');
        }
    }
}

function displayFiles(files, infoHash) {
    if (files.length === 0) {
        fileList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <p>No files found</p>
            </div>
        `;
        return;
    }
    
    const filesHTML = files.map((file, index) => `
        <div class="file-item" onclick="playFile('${infoHash}', ${index}, '${file.type}')">
            <div class="file-icon">
                <i class="fas ${getFileIcon(file.type)}"></i>
            </div>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-details">
                    <span class="file-size">${formatFileSize(file.length)}</span>
                    <span class="file-type">${file.type}</span>
                </div>
            </div>
            <div class="file-actions">
                <button class="btn btn-small btn-primary" onclick="event.stopPropagation(); playFile('${infoHash}', ${index}, '${file.type}')">
                    <i class="fas fa-play"></i>
                </button>
            </div>
        </div>
    `).join('');
    
    fileList.innerHTML = filesHTML;
}

function getFileIcon(type) {
    const icons = {
        'video': 'fa-play-circle',
        'audio': 'fa-music',
        'image': 'fa-image',
        'document': 'fa-file-alt',
        'other': 'fa-file'
    };
    return icons[type] || 'fa-file';
}

async function playFile(infoHash, fileIndex, fileType) {
    const torrent = activeTorrents.get(infoHash);
    if (!torrent) return;
    
    // Only play video files in the video player
    if (fileType === 'video') {
        const fileUrl = `/api/stream/${infoHash}/file/${fileIndex}`;
        
        // Update current torrent to this file
        currentTorrent = {
            ...torrent,
            currentFileIndex: fileIndex,
            currentFileUrl: fileUrl
        };
        
        // Set this video as currently playing for prioritization
        await setCurrentlyPlayingVideo(infoHash);
        
        // Show video section
        videoSection.style.display = 'block';
        videoSection.scrollIntoView({ behavior: 'smooth' });
        
        // Update video info
        const file = torrent.files[fileIndex];
        videoTitle.textContent = file.name;
        videoSize.textContent = formatFileSize(file.length);
        
        // Set video source
        videoPlayer.src = fileUrl;
        
        // Show loading overlay
        showVideoOverlay('Loading video...');
        
        showToast(`Playing: ${file.name}`, 'success');
    } else {
        // For non-video files, open in new tab
        const fileUrl = `/api/stream/${infoHash}/file/${fileIndex}`;
        window.open(fileUrl, '_blank');
        showToast(`Opening: ${torrent.files[fileIndex].name}`, 'info');
    }
}

function refreshFiles() {
    if (selectedTorrentForFiles) {
        loadFilesForTorrent(selectedTorrentForFiles);
    }
}

// Set currently playing video for prioritization
async function setCurrentlyPlayingVideo(infoHash) {
    try {
        const response = await fetch(`/api/playing/${infoHash}`, {
            method: 'POST'
        });
        
        if (response.ok) {
            console.log('🎬 Video prioritization set for:', infoHash);
        }
    } catch (error) {
        console.error('Error setting video prioritization:', error);
    }
}

// Stop video prioritization
async function stopVideoPrioritization() {
    try {
        const response = await fetch('/api/playing/stop', {
            method: 'POST'
        });
        
        if (response.ok) {
            console.log('🎬 Video prioritization stopped');
        }
    } catch (error) {
        console.error('Error stopping video prioritization:', error);
    }
}

// Global functions for onclick handlers
window.playTorrent = playTorrent;
window.removeTorrent = removeTorrent;
window.fillExample = fillExample;
window.openFileManager = openFileManager;
window.closeFileManager = closeFileManager;
window.selectTorrentForFiles = selectTorrentForFiles;
window.playFile = playFile;
window.refreshFiles = refreshFiles;
