// Custom Video Player Class
class CustomVideoPlayer {
    constructor() {
        this.video = document.getElementById('videoPlayer');
        this.player = document.getElementById('customVideoPlayer');
        this.controls = document.getElementById('customControls');
        
        // Control elements
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.muteBtn = document.getElementById('muteBtn');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.captionsBtn = document.getElementById('captionsBtn');
        this.progressBar = document.getElementById('progressBar');
        this.progressFill = document.getElementById('progressFill');
        this.progressBuffer = document.getElementById('progressBuffer');
        this.progressHandle = document.getElementById('progressHandle');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeFill = document.getElementById('volumeFill');
        this.volumeHandle = document.getElementById('volumeHandle');
        this.currentTimeEl = document.getElementById('currentTime');
        this.totalTimeEl = document.getElementById('totalTime');
        
        // Caption elements
        this.captionOverlay = document.getElementById('captionOverlay');
        this.captionText = document.getElementById('captionText');
        
        this.isPlaying = false;
        this.isMuted = false;
        this.isFullscreen = false;
        this.volume = 1;
        this.isDragging = false;
        this.isVolumeDragging = false;
        
        // Initialize volume
        this.video.volume = this.volume;
        this.updateVolumeDisplay();
        
        this.init();
    }
    
    init() {
        // Remove native controls to prevent fullscreen
        this.video.removeAttribute('controls');
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Video events
        this.video.addEventListener('loadedmetadata', () => this.onLoadedMetadata());
        this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.video.addEventListener('play', () => this.onPlay());
        this.video.addEventListener('pause', () => this.onPause());
        this.video.addEventListener('ended', () => this.onEnded());
        this.video.addEventListener('error', () => this.onError());
        this.video.addEventListener('progress', () => this.onProgress());
        this.video.addEventListener('volumechange', () => this.onVolumeChange());
        
        // Prevent video from going fullscreen on double-click
        this.video.addEventListener('dblclick', (e) => {
            e.preventDefault();
            this.toggleFullscreen();
        });
        
        // Prevent video from going fullscreen on context menu
        this.video.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        // Override video fullscreen methods to redirect to our custom fullscreen
        this.video.requestFullscreen = () => this.toggleFullscreen();
        this.video.webkitRequestFullscreen = () => this.toggleFullscreen();
        this.video.mozRequestFullScreen = () => this.toggleFullscreen();
        this.video.msRequestFullscreen = () => this.toggleFullscreen();
        
        // Control events
        this.playPauseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePlayPause();
        });
        this.muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMute();
        });
        this.fullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFullscreen();
        });
        this.captionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleCaptions();
        });
        
        // Progress bar events
        this.progressBar.addEventListener('click', (e) => {
            e.stopPropagation();
            this.seekTo(e);
        });
        this.progressBar.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startDragging(e);
        });
        document.addEventListener('mousemove', (e) => this.onDrag(e));
        document.addEventListener('mouseup', () => this.stopDragging());
        
        // Volume slider events
        this.volumeSlider.addEventListener('click', (e) => {
            e.stopPropagation();
            this.setVolume(e);
        });
        this.volumeSlider.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startVolumeDragging(e);
        });
        document.addEventListener('mousemove', (e) => this.onVolumeDrag(e));
        document.addEventListener('mouseup', () => this.stopVolumeDragging());
        
        // Player events
        this.player.addEventListener('click', () => this.togglePlayPause());
        this.player.addEventListener('mouseenter', () => this.showControls());
        this.player.addEventListener('mouseleave', () => this.hideControls());
        
        // Prevent controls from triggering player click
        this.controls.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // Keyboard events
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        
        // Resize events
        window.addEventListener('resize', () => this.handleResize());
        
        // Fullscreen events
        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('mozfullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('MSFullscreenChange', () => this.handleFullscreenChange());
        
        // Prevent video from going fullscreen by intercepting fullscreen events
        this.video.addEventListener('fullscreenchange', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        // Watch for any attempts to make video fullscreen and redirect to our custom fullscreen
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'controls') {
                    // If controls are added back, remove them
                    if (this.video.hasAttribute('controls')) {
                        this.video.removeAttribute('controls');
                    }
                }
            });
        });
        
        observer.observe(this.video, {
            attributes: true,
            attributeFilter: ['controls']
        });
    }
    
    onLoadedMetadata() {
        this.updateTimeDisplay();
    }
    
    onTimeUpdate() {
        this.updateProgress();
        this.updateTimeDisplay();
        this.updateCaptions();
    }
    
    onPlay() {
        this.isPlaying = true;
        this.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    }
    
    onPause() {
        this.isPlaying = false;
        this.playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
    
    onEnded() {
        this.isPlaying = false;
        this.playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        this.progressFill.style.width = '0%';
    }
    
    onError() {
        console.error('Video error');
    }
    
    onProgress() {
        this.updateBuffer();
    }
    
    onVolumeChange() {
        // Sync our volume with the video's actual volume
        this.volume = this.video.volume;
        this.isMuted = this.video.muted;
        
        // Update mute button icon
        this.muteBtn.innerHTML = this.isMuted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
        
        // Update volume display
        this.updateVolumeDisplay();
    }
    
    togglePlayPause() {
        if (this.isPlaying) {
            this.video.pause();
        } else {
            this.video.play();
        }
    }
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        this.video.muted = this.isMuted;
        this.muteBtn.innerHTML = this.isMuted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
        
        // Update volume display to reflect mute state
        this.updateVolumeDisplay();
    }
    
    toggleFullscreen() {
        if (!this.isFullscreen) {
            this.enterFullscreen();
        } else {
            this.exitFullscreen();
        }
    }
    
    async enterFullscreen() {
        try {
            // Store current state before entering fullscreen
            const currentSrc = this.video.src;
            const currentTime = this.video.currentTime;
            const wasPlaying = !this.video.paused;
            
            // Always use the player container for fullscreen to keep custom controls
            if (this.player.requestFullscreen) {
                await this.player.requestFullscreen();
            } else if (this.player.webkitRequestFullscreen) {
                await this.player.webkitRequestFullscreen();
            } else if (this.player.mozRequestFullScreen) {
                await this.player.mozRequestFullScreen();
            } else if (this.player.msRequestFullscreen) {
                await this.player.msRequestFullscreen();
            }
            
            // Ensure video source is preserved
            if (this.video.src !== currentSrc) {
                this.video.src = currentSrc;
                this.video.currentTime = currentTime;
                if (wasPlaying) {
                    this.video.play().catch(console.error);
                }
            }
        } catch (error) {
            console.error('Error entering fullscreen:', error);
        }
    }
    
    async exitFullscreen() {
        try {
            if (document.exitFullscreen) {
                await document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                await document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                await document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                await document.msExitFullscreen();
            }
        } catch (error) {
            console.error('Error exiting fullscreen:', error);
        }
    }
    
    handleFullscreenChange() {
        const fullscreenElement = document.fullscreenElement || 
                                 document.webkitFullscreenElement || 
                                 document.mozFullScreenElement || 
                                 document.msFullscreenElement;
        
        const isFullscreen = !!(fullscreenElement && fullscreenElement === this.player);
        
        this.isFullscreen = isFullscreen;
        this.fullscreenBtn.innerHTML = isFullscreen ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
        
        // Store current playback state
        const wasPlaying = !this.video.paused;
        const currentTime = this.video.currentTime;
        
        if (isFullscreen) {
            this.player.classList.add('fullscreen');
        } else {
            this.player.classList.remove('fullscreen');
        }
        
        // Restore playback state after fullscreen transition
        setTimeout(() => {
            if (wasPlaying && !this.video.paused) {
                // Video is still playing, just update time if needed
                if (Math.abs(this.video.currentTime - currentTime) > 1) {
                    this.video.currentTime = currentTime;
                }
            } else if (wasPlaying && this.video.paused) {
                // Video was paused during fullscreen transition, resume
                this.video.play().catch(console.error);
            }
            this.handleResize();
        }, 100);
    }
    
    handleResize() {
        // Handle any resize-related updates if needed
        // For now, just ensure controls are properly positioned
    }
    
    toggleCaptions() {
        if (typeof toggleCaptions === 'function') {
            toggleCaptions();
        }
    }
    
    seekTo(e) {
        if (this.isDragging) return;
        const rect = this.progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const time = percent * this.video.duration;
        this.video.currentTime = time;
    }
    
    startDragging(e) {
        this.isDragging = true;
        this.seekTo(e);
    }
    
    onDrag(e) {
        if (!this.isDragging) return;
        this.seekTo(e);
    }
    
    stopDragging() {
        this.isDragging = false;
    }
    
    setVolume(e) {
        if (this.isVolumeDragging) return;
        const rect = this.volumeSlider.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        this.volume = Math.max(0, Math.min(1, percent));
        
        // Set video volume and unmute if muted
        this.video.volume = this.volume;
        if (this.isMuted && this.volume > 0) {
            this.isMuted = false;
            this.video.muted = false;
            this.muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        }
        
        this.updateVolumeDisplay();
    }
    
    startVolumeDragging(e) {
        this.isVolumeDragging = true;
        this.setVolume(e);
    }
    
    onVolumeDrag(e) {
        if (!this.isVolumeDragging) return;
        const rect = this.volumeSlider.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        this.volume = Math.max(0, Math.min(1, percent));
        
        // Set video volume and unmute if muted
        this.video.volume = this.volume;
        if (this.isMuted && this.volume > 0) {
            this.isMuted = false;
            this.video.muted = false;
            this.muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        }
        
        this.updateVolumeDisplay();
    }
    
    stopVolumeDragging() {
        this.isVolumeDragging = false;
    }
    
    updateProgress() {
        if (this.video.duration) {
            const percent = (this.video.currentTime / this.video.duration) * 100;
            this.progressFill.style.width = percent + '%';
            this.progressHandle.style.left = percent + '%';
        }
    }
    
    updateBuffer() {
        if (this.video.buffered.length > 0) {
            const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
            const percent = (bufferedEnd / this.video.duration) * 100;
            this.progressBuffer.style.width = percent + '%';
        }
    }
    
    updateTimeDisplay() {
        this.currentTimeEl.textContent = this.formatTime(this.video.currentTime);
        this.totalTimeEl.textContent = this.formatTime(this.video.duration);
    }
    
    updateVolumeDisplay() {
        // Show volume level even when muted
        const displayVolume = this.isMuted ? 0 : this.volume;
        this.volumeFill.style.width = (displayVolume * 100) + '%';
        this.volumeHandle.style.left = (displayVolume * 100) + '%';
    }
    
    updateCaptions() {
        if (typeof updateCaptions === 'function') {
            updateCaptions();
        }
    }
    
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    showControls() {
        this.controls.classList.add('show');
    }
    
    hideControls() {
        this.controls.classList.remove('show');
    }
    
    onKeyDown(e) {
        switch(e.code) {
            case 'Space':
                e.preventDefault();
                this.togglePlayPause();
                break;
            case 'KeyF':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 'KeyM':
                e.preventDefault();
                this.toggleMute();
                break;
            case 'KeyC':
                e.preventDefault();
                this.toggleCaptions();
                break;
        }
    }
    
    
    setSource(src) {
        this.video.src = src;
    }
    
    play() {
        return this.video.play();
    }
    
    pause() {
        this.video.pause();
    }
    
    get currentTime() {
        return this.video.currentTime;
    }
    
    get duration() {
        return this.video.duration;
    }
    
    get paused() {
        return this.video.paused;
    }
}

// Global variables
let socket;
let currentTorrent = null;
let activeTorrents = new Map();
let selectedTorrentForFiles = null;
let currentCaptions = [];
let captionData = [];
let isCaptionsEnabled = false;
let currentCaptionIndex = 0;
let customVideoPlayer = null;

// DOM elements
const magnetInput = document.getElementById('magnetInput');
const addTorrentBtn = document.getElementById('addTorrentBtn');
const videoSection = document.getElementById('videoSection');
const videoPlayer = document.getElementById('videoPlayer');
const videoOverlay = document.getElementById('videoOverlay');
const videoTitle = document.getElementById('videoTitle');
const videoSize = document.getElementById('videoSize');
const videoResolution = document.getElementById('videoResolution');
const videoProgress = document.getElementById('videoProgress');
const qualityCircle = document.getElementById('qualityCircle');
// const torrentList = document.getElementById('torrentList'); // Hidden section
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
const closeTorrentBtn = document.getElementById('closeTorrentBtn');

// Video close button
const closeVideoBtn = document.getElementById('closeVideoBtn');

// Caption elements
const captionOverlay = document.getElementById('captionOverlay');
const captionText = document.getElementById('captionText');
const captionControlsInline = document.getElementById('captionControlsInline');
const captionDropdownMenu = document.getElementById('captionDropdownMenu');

// Settings modal elements
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const restartServerBtn = document.getElementById('restartServerBtn');
const serverStatus = document.getElementById('serverStatus');
const serverUptime = document.getElementById('serverUptime');
const activeTorrentsCount = document.getElementById('activeTorrentsCount');
const connectedClientsCount = document.getElementById('connectedClientsCount');

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Initialize custom video player
    customVideoPlayer = new CustomVideoPlayer();
    
    initializeSocket();
    setupEventListeners();
    updateConnectionStatus(false);
    
    // Update piece priorities every 5 seconds
    setInterval(() => {
        if (currentTorrent) {
            setCurrentlyPlayingVideo(currentTorrent.infoHash);
            
            // Also update quality circle with current torrent data
            const torrent = activeTorrents.get(currentTorrent.infoHash);
            if (torrent) {
                updateQualityCircle(torrent.adaptiveQuality, torrent.downloadSpeed);
            }
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
        console.log('Received torrentProgress:', data);
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
    
    socket.on('torrentRemoved', (data) => {
        console.log('Torrent removed:', data.infoHash);
        activeTorrents.delete(data.infoHash);
        updateTorrentList();
        updateTorrentSelector();
        
        // If this was the current torrent, stop video and hide video section
        if (currentTorrent && currentTorrent.infoHash === data.infoHash) {
            // Stop video playback
            videoPlayer.pause();
            videoPlayer.src = '';
            videoPlayer.load(); // Reset the video element
            
            // Stop video prioritization
            stopVideoPrioritization();
            
            // Clear current torrent and hide video section
            currentTorrent = null;
            videoSection.style.display = 'none';
            
            // Clear video info
            videoTitle.textContent = '';
            videoSize.textContent = '';
            videoResolution.textContent = '-';
            videoProgress.textContent = '';
            qualityCircle.className = 'quality-circle';
            qualityCircle.title = '';
            
            // Hide any loading overlay
            hideVideoOverlay();
            
            showToast('Torrent was removed', 'info');
        }
        
        // If this was the selected torrent for files, clear selection
        if (selectedTorrentForFiles === data.infoHash) {
            selectedTorrentForFiles = null;
            fileList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <p>No files to display</p>
                    <small>Select a torrent to browse its files</small>
                </div>
            `;
        }
    });
    
    socket.on('serverRestarting', (data) => {
        console.log('Server restarting:', data.message);
        showToast(data.message, 'warning');
        updateConnectionStatus(false);
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
    closeTorrentBtn.addEventListener('click', closeCurrentTorrent);
    
    // Video close button event
    closeVideoBtn.addEventListener('click', closeVideo);
    
    // Caption events
    captionDropdownMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.caption-dropdown-item');
        if (item) {
            const value = item.getAttribute('data-value');
            selectCaptionTrack(value);
        }
    });
    
    // Settings modal events
    settingsBtn.addEventListener('click', openSettingsModal);
    closeSettingsBtn.addEventListener('click', closeSettingsModal);
    restartServerBtn.addEventListener('click', restartServer);
    
    // Close modal when clicking outside
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettingsModal();
        }
    });
    
    // Video player events
    videoPlayer.addEventListener('loadstart', () => {
        showVideoOverlay('Loading video...');
    });
    
    videoPlayer.addEventListener('canplay', () => {
        hideVideoOverlay();
        // Update video resolution when video is ready
        updateVideoResolution();
        // Auto-play the video when it's ready
        videoPlayer.play().catch(error => {
            console.log('Auto-play prevented by browser:', error);
            // Show a play button or message if auto-play is blocked
            showVideoOverlay('Click to play video');
        });
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
    
    // Caption synchronization
    videoPlayer.addEventListener('timeupdate', updateCaptions);
    
    // Fullscreen change events for caption positioning
    videoPlayer.addEventListener('fullscreenchange', handleFullscreenChange);
    videoPlayer.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    videoPlayer.addEventListener('mozfullscreenchange', handleFullscreenChange);
    videoPlayer.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    // Also listen to document fullscreen changes
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    // Fullscreen caption handling is now simplified and handled by CSS
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
        captionFiles: data.captionFiles || [],
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
    videoResolution.textContent = '-'; // Will be updated when video loads
    qualityCircle.className = 'quality-circle'; // Reset to default
    qualityCircle.title = ''; // Clear tooltip
    
    // Initialize progress display
    videoProgress.textContent = '0% Buffered';
    
    // Setup captions
    setupCaptions(torrent);
    
    // Set video source
    const videoUrl = `/api/stream/${infoHash}`;
    customVideoPlayer.setSource(videoUrl);
    
    // Show loading overlay
    showVideoOverlay('Loading video...');
    
    // Try to auto-play when video is loaded
    customVideoPlayer.video.addEventListener('canplay', function autoPlayHandler() {
        customVideoPlayer.video.removeEventListener('canplay', autoPlayHandler); // Remove to prevent multiple calls
        customVideoPlayer.play().catch(error => {
            console.log('Auto-play prevented by browser:', error);
            showVideoOverlay('Click to play video');
        });
    }, { once: true });
}

// Update quality circle based on speed and quality
function updateQualityCircle(quality, downloadSpeed) {
    // Remove existing quality classes
    qualityCircle.classList.remove('high', 'medium', 'low');
    
    // Determine quality level based on download speed as primary indicator
    // The adaptive quality from backend might not be accurate for display
    let qualityLevel = 'medium'; // Default
    
    // Use download speed as primary indicator for better user feedback
    if (downloadSpeed > 2000000) { // > 2MB/s
        qualityLevel = 'high';
    } else if (downloadSpeed > 1000000) { // > 1MB/s
        qualityLevel = 'high';
    } else if (downloadSpeed > 500000) { // > 500KB/s
        qualityLevel = 'medium';
    } else if (downloadSpeed > 100000) { // > 100KB/s
        qualityLevel = 'medium';
    } else {
        qualityLevel = 'low';
    }
    
    // Override with adaptive quality only if it's more optimistic than speed-based
    if (quality === 'high' || quality === 'very-high') {
        qualityLevel = 'high';
    } else if (quality === 'very-low' && downloadSpeed < 50000) { // Only use very-low if speed is very low
        qualityLevel = 'low';
    }
    
    qualityCircle.classList.add(qualityLevel);
    
    // Update tooltip with download speed only
    const speedMBps = (downloadSpeed / 1024 / 1024).toFixed(1);
    qualityCircle.title = `${speedMBps} MB/s`;
    
    // Debug logging (minimal)
    if (quality === 'very-low' && downloadSpeed > 1000000) {
        console.log(`Quality mismatch: ${quality} vs high speed ${(downloadSpeed / 1024 / 1024).toFixed(1)}MB/s`);
    }
}

// Get video resolution from video element
function getVideoResolution() {
    if (videoPlayer.videoWidth && videoPlayer.videoHeight) {
        const width = videoPlayer.videoWidth;
        const height = videoPlayer.videoHeight;
        
        // Common resolution mappings
        if (width >= 3840 && height >= 2160) return '4K';
        if (width >= 2560 && height >= 1440) return '1440p';
        if (width >= 1920 && height >= 1080) return '1080p';
        if (width >= 1280 && height >= 720) return '720p';
        if (width >= 854 && height >= 480) return '480p';
        if (width >= 640 && height >= 360) return '360p';
        
        return `${width}x${height}`;
    }
    return '-';
}

// Update video resolution display
function updateVideoResolution() {
    const resolution = getVideoResolution();
    videoResolution.textContent = resolution;
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
            const bufferPercent = Math.round((data.bufferHealth || 0) * 100);
            const progressPercent = Math.round((data.progress || 0) * 100);
            const quality = data.adaptiveQuality || 'medium';
            
            // Debug logging (minimal)
            if (bufferPercent > 95 && progressPercent < 10) {
                console.log('Buffer inconsistency detected:', bufferPercent + '% buffer vs ' + progressPercent + '% progress');
            }
            
            // Update buffered percentage (renamed from complete)
            let statusText = `${bufferPercent}% Buffered`;
            if (data.isLowSeeder) {
                statusText += ` | Low seeders (${data.seeders})`;
            }
            
            videoProgress.textContent = statusText;
            
            // Update quality circle based on speed/quality
            updateQualityCircle(quality, data.downloadSpeed);
            
        }
    }
}

// Update torrent list (hidden section - kept for data management)
function updateTorrentList() {
    // Torrent list section is hidden, but we still manage torrent data
    // for file manager and other functionality
    console.log(`Active torrents: ${activeTorrents.size}`);
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
            updateTorrentList(); // Still call for data management
            
            // If this was the current torrent, stop video and hide video section
            if (currentTorrent && currentTorrent.infoHash === infoHash) {
                // Stop video playback
                videoPlayer.pause();
                videoPlayer.src = '';
                videoPlayer.load(); // Reset the video element
                
                // Stop video prioritization
                stopVideoPrioritization();
                
                // Clear current torrent and hide video section
                currentTorrent = null;
                videoSection.style.display = 'none';
                
                // Clear video info
                videoTitle.textContent = '';
                videoSize.textContent = '';
                videoResolution.textContent = '-';
                videoProgress.textContent = '';
                qualityCircle.className = 'quality-circle';
                qualityCircle.title = '';
                
                // Hide any loading overlay
                hideVideoOverlay();
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

// Close video function
function closeVideo() {
    // Stop video playback
    videoPlayer.pause();
    videoPlayer.src = '';
    videoPlayer.load(); // Reset the video element
    
    // Stop video prioritization
    stopVideoPrioritization();
    
    // Clear current torrent and hide video section
    currentTorrent = null;
    videoSection.style.display = 'none';
    
    // Clear video info
    videoTitle.textContent = 'No video selected';
    videoSize.textContent = '-';
    videoResolution.textContent = '-';
    videoProgress.textContent = '-';
    qualityCircle.className = 'quality-circle';
    qualityCircle.title = '';
    priorityIcon.style.display = 'none';
    
    // Reset captions
    currentCaptions = [];
    captionData = [];
    isCaptionsEnabled = false;
    currentCaptionIndex = 0;
    captionText.textContent = '';
    captionText.classList.add('hidden');
    captionControlsInline.style.display = 'none';
    captionOverlay.style.display = 'none';
    
    // Ensure caption overlay is moved back to video section
    if (captionOverlay.parentNode === document.body) {
        const videoSection = document.getElementById('videoSection');
        videoSection.appendChild(captionOverlay);
        captionOverlay.classList.remove('fullscreen');
    }
    
    // Hide any loading overlay
    hideVideoOverlay();
    
    showToast('Video closed', 'info');
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

// Toast notifications - Single toast system with fast transitions
let currentToast = null;
let toastQueue = [];

function showToast(message, type = 'info') {
    // Add to queue
    toastQueue.push({ message, type });
    
    // If no toast is currently showing, show the next one
    if (!currentToast) {
        showNextToast();
    }
}

function showNextToast() {
    if (toastQueue.length === 0) {
        currentToast = null;
        return;
    }
    
    const { message, type } = toastQueue.shift();
    
    // Remove any existing toast
    if (currentToast) {
        currentToast.remove();
    }
    
    // Create new toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    currentToast = toast;
    
    // Trigger animation immediately
    setTimeout(() => toast.classList.add('show'), 50);
    
    // Hide and remove after 2.5 seconds
    setTimeout(() => {
        if (toast === currentToast) {
            toast.classList.remove('show');
            
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
                currentToast = null;
                // Show next toast in queue
                showNextToast();
            }, 200);
        }
    }, 2500);
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
    
    // Hide the entire file manager button section
    const fileManagerButtonSection = document.querySelector('.file-manager-button-section');
    if (fileManagerButtonSection) {
        fileManagerButtonSection.style.display = 'none';
    }
}

function closeFileManager() {
    fileManagerSection.style.display = 'none';
    
    // Show the entire file manager button section again
    const fileManagerButtonSection = document.querySelector('.file-manager-button-section');
    if (fileManagerButtonSection) {
        fileManagerButtonSection.style.display = 'block';
    }
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
        videoResolution.textContent = '-'; // Will be updated when video loads
        qualityCircle.className = 'quality-circle'; // Reset to default
        qualityCircle.title = ''; // Clear tooltip
        
        // Initialize progress display
        videoProgress.textContent = '0% Buffered';
        
        // Setup captions for this file
        setupCaptions(torrent);
        
        // Set video source
        videoPlayer.src = fileUrl;
        
        // Show loading overlay
        showVideoOverlay('Loading video...');
        
        // Try to auto-play when video is loaded
        videoPlayer.addEventListener('canplay', function autoPlayHandler() {
            videoPlayer.removeEventListener('canplay', autoPlayHandler); // Remove to prevent multiple calls
            videoPlayer.play().catch(error => {
                console.log('Auto-play prevented by browser:', error);
                showVideoOverlay('Click to play video');
            });
        }, { once: true });
        
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

// Close current torrent function
async function closeCurrentTorrent() {
    if (!selectedTorrentForFiles) {
        showToast('No torrent selected', 'warning');
        return;
    }
    
    const torrent = activeTorrents.get(selectedTorrentForFiles);
    if (!torrent) {
        showToast('Torrent not found', 'error');
        return;
    }
    
    // Show warning confirmation
    const torrentName = torrent.name || 'Unknown Torrent';
    const confirmed = confirm(
        `Are you sure you want to close this torrent?\n\n` +
        `Torrent: ${torrentName}\n\n` +
        `This will:\n` +
        `• Stop the video if it's playing\n` +
        `• Remove the torrent completely\n` +
        `• Delete all downloaded data\n\n` +
        `This action cannot be undone!`
    );
    
    if (!confirmed) {
        return;
    }
    
    // Disable button during operation
    closeTorrentBtn.disabled = true;
    closeTorrentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Closing...';
    
    try {
        // Remove the torrent using the existing removeTorrent function
        await removeTorrent(selectedTorrentForFiles);
        
        // Clear file manager selection
        selectedTorrentForFiles = null;
        fileList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <p>No files to display</p>
                <small>Select a torrent to browse its files</small>
            </div>
        `;
        filePath.innerHTML = `
            <i class="fas fa-folder"></i>
            <span>Select a torrent to browse files</span>
        `;
        
        // Update torrent selector
        updateTorrentSelector();
        
        showToast('Torrent closed successfully', 'success');
    } catch (error) {
        console.error('Error closing torrent:', error);
        showToast('Failed to close torrent', 'error');
    } finally {
        // Re-enable button
        closeTorrentBtn.disabled = false;
        closeTorrentBtn.innerHTML = '<i class="fas fa-trash"></i> Close Torrent';
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

// Settings Modal Functions
function openSettingsModal() {
    settingsModal.classList.add('show');
    updateSystemInfo();
}

function closeSettingsModal() {
    settingsModal.classList.remove('show');
}

function updateSystemInfo() {
    // Update active torrents count
    activeTorrentsCount.textContent = activeTorrents.size;
    
    // Update server status
    serverStatus.textContent = 'Running';
    serverStatus.style.color = '#28a745';
    
    // Update uptime (simplified - in real app you'd get this from server)
    const uptime = new Date().toLocaleString();
    serverUptime.textContent = uptime;
}

// Auto-reconnection function
async function attemptReconnection() {
    try {
        const response = await fetch('/api/health', { 
            method: 'GET',
            timeout: 5000 
        });
        
        if (response.ok) {
            showToast('Server is back online! Reloading page in 5 seconds...', 'success');
            setTimeout(() => {
                location.reload();
            }, 5000);
            return;
        }
    } catch (error) {
        console.log('Reconnection failed, will retry automatically');
    }
    
    // Retry after 5 seconds
    setTimeout(attemptReconnection, 5000);
}

// Server Restart Function
async function restartServer() {
    if (!confirm('Are you sure you want to restart the server? This will disconnect all clients and stop all active torrents.')) {
        return;
    }
    
    restartServerBtn.disabled = true;
    restartServerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restarting...';
    
    try {
        const response = await fetch('/api/restart', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Server restart initiated. Reconnecting...', 'info');
            // Start reconnection attempts
            attemptReconnection();
        } else {
            showToast(`Error: ${result.error}`, 'error');
            restartServerBtn.disabled = false;
            restartServerBtn.innerHTML = '<i class="fas fa-redo"></i> Restart Server';
        }
    } catch (error) {
        console.error('Error restarting server:', error);
        showToast('Failed to restart server', 'error');
        restartServerBtn.disabled = false;
        restartServerBtn.innerHTML = '<i class="fas fa-redo"></i> Restart Server';
    }
}

// Caption Functions
function setupCaptions(torrent) {
    currentCaptions = torrent.captionFiles || [];
    captionData = [];
    isCaptionsEnabled = false;
    currentCaptionIndex = 0;
    
    // Clear previous captions
    captionText.textContent = '';
    captionText.classList.add('hidden');
    
    if (currentCaptions.length > 0) {
        // Show inline caption controls
        captionControlsInline.style.display = 'flex';
        
        // Populate caption dropdown
        captionDropdownMenu.innerHTML = `
            <div class="caption-dropdown-item" data-value="">
                <i class="fas fa-times"></i>
                No Captions
            </div>
        `;
        currentCaptions.forEach((caption, index) => {
            const item = document.createElement('div');
            item.className = 'caption-dropdown-item';
            item.setAttribute('data-value', index);
            item.innerHTML = `
                <i class="fas fa-closed-captioning"></i>
                ${caption.name}
            `;
            captionDropdownMenu.appendChild(item);
        });
        
        // Reset caption toggle button
        if (customVideoPlayer) {
            customVideoPlayer.captionsBtn.classList.remove('active');
        }
        
        // Show caption overlay
        captionOverlay.style.display = 'block';
        
        // Automatically select the first caption track if available
        if (currentCaptions.length > 0) {
            selectCaptionTrack('0');
        }
    } else {
        // Hide caption controls
        captionControlsInline.style.display = 'none';
        
        // Hide caption overlay
        captionOverlay.style.display = 'none';
    }
}

function toggleCaptions() {
    if (currentCaptions.length === 0) {
        showToast('No captions available for this video', 'warning');
        return;
    }
    
    // If captions are enabled, disable them and select "No Captions"
    if (isCaptionsEnabled) {
        selectCaptionTrack('');
    } else {
        // If captions are disabled, show the dropdown to let user select a track
        // The dropdown will automatically enable captions when a track is selected
        showToast('Select a caption track from the dropdown', 'info');
    }
}

function selectCaptionTrack(value) {
    // Remove selected class from all items
    captionDropdownMenu.querySelectorAll('.caption-dropdown-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Add selected class to clicked item
    const selectedItem = captionDropdownMenu.querySelector(`[data-value="${value}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
    }
    
    if (value === '') {
        // Disable captions when "No Captions" is selected
        isCaptionsEnabled = false;
        captionText.textContent = '';
        captionText.classList.add('hidden');
        captionData = [];
        
        // Update caption button state
        if (customVideoPlayer) {
            customVideoPlayer.captionsBtn.classList.remove('active');
        }
        return;
    }
    
    // Automatically enable captions when a track is selected
    isCaptionsEnabled = true;
    captionText.classList.remove('hidden');
    
    // Update caption button state
    if (customVideoPlayer) {
        customVideoPlayer.captionsBtn.classList.add('active');
    }
    
    const captionIndex = parseInt(value);
    loadCaptions(captionIndex);
}

async function loadCaptions(captionIndex) {
    if (!currentTorrent) return;
    
    try {
        const response = await fetch(`/api/stream/${currentTorrent.infoHash}/caption/${captionIndex}`);
        const captionText = await response.text();
        
        // Parse caption file based on extension
        const captionFile = currentCaptions[captionIndex];
        const extension = captionFile.name.toLowerCase().split('.').pop();
        
        if (extension === 'srt') {
            captionData = parseSRT(captionText);
        } else if (extension === 'vtt') {
            captionData = parseVTT(captionText);
        } else {
            showToast('Unsupported caption format', 'warning');
            return;
        }
        
        showToast(`Loaded ${captionData.length} captions`, 'success');
    } catch (error) {
        console.error('Error loading captions:', error);
        showToast('Failed to load captions', 'error');
    }
}

function parseSRT(text) {
    const captions = [];
    const blocks = text.trim().split(/\n\s*\n/);
    
    for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length >= 3) {
            const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
            if (timeMatch) {
                const startTime = parseTime(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
                const endTime = parseTime(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
                const text = lines.slice(2).join('\n').replace(/<[^>]*>/g, ''); // Remove HTML tags
                
                captions.push({
                    start: startTime,
                    end: endTime,
                    text: text
                });
            }
        }
    }
    
    return captions;
}

function parseVTT(text) {
    const captions = [];
    const lines = text.split('\n');
    let currentCaption = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.includes('-->')) {
            const timeMatch = line.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
            if (timeMatch) {
                const startTime = parseTime(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
                const endTime = parseTime(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
                
                currentCaption = {
                    start: startTime,
                    end: endTime,
                    text: ''
                };
            }
        } else if (currentCaption && line && !line.startsWith('NOTE') && !line.startsWith('WEBVTT')) {
            if (currentCaption.text) {
                currentCaption.text += '\n' + line.replace(/<[^>]*>/g, ''); // Remove HTML tags
            } else {
                currentCaption.text = line.replace(/<[^>]*>/g, '');
            }
        } else if (currentCaption && line === '') {
            if (currentCaption.text) {
                captions.push(currentCaption);
                currentCaption = null;
            }
        }
    }
    
    if (currentCaption && currentCaption.text) {
        captions.push(currentCaption);
    }
    
    return captions;
}

function parseTime(hours, minutes, seconds, milliseconds) {
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(milliseconds) / 1000;
}

function updateCaptions() {
    if (!isCaptionsEnabled || captionData.length === 0 || !customVideoPlayer) {
        return;
    }
    
    const currentTime = customVideoPlayer.currentTime;
    
    // Find current caption
    let currentCaption = null;
    for (let i = 0; i < captionData.length; i++) {
        if (currentTime >= captionData[i].start && currentTime <= captionData[i].end) {
            currentCaption = captionData[i];
            currentCaptionIndex = i;
            break;
        }
    }
    
    if (currentCaption) {
        captionText.textContent = currentCaption.text;
        captionText.classList.remove('hidden');
    } else {
        captionText.textContent = '';
        captionText.classList.add('hidden');
    }
}

function handleFullscreenChange() {
    // Check if video is in fullscreen mode
    const isFullscreen = !!(document.fullscreenElement || 
                           document.webkitFullscreenElement || 
                           document.mozFullScreenElement || 
                           document.msFullscreenElement);
    
    if (isFullscreen) {
        // Add fullscreen class to caption overlay for styling
        captionOverlay.classList.add('fullscreen');
    } else {
        // Remove fullscreen class
        captionOverlay.classList.remove('fullscreen');
    }
}

// Removed complex fullscreen checking - now handled by CSS and simple class toggle

// Global functions for onclick handlers
window.playTorrent = playTorrent;
window.removeTorrent = removeTorrent;
window.fillExample = fillExample;
window.openFileManager = openFileManager;
window.closeFileManager = closeFileManager;
window.selectTorrentForFiles = selectTorrentForFiles;
window.playFile = playFile;
window.refreshFiles = refreshFiles;
window.closeVideo = closeVideo;
window.closeCurrentTorrent = closeCurrentTorrent;
