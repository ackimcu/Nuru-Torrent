# Nuru Torrent Streamer

A powerful torrent streaming client that allows you to stream torrents directly in your browser without downloading them completely. Features a built-in video player and real-time streaming capabilities.

## Features

- 🎬 **Stream torrents instantly** - No need to download complete files
- 🎥 **Built-in video player** - HTML5 video player with full controls
- ⚡ **Real-time streaming** - WebSocket-based progress updates
- 📱 **Responsive design** - Works on desktop and mobile devices
- 🔄 **Multiple torrents** - Manage multiple torrents simultaneously
- 📊 **Progress tracking** - Real-time download/upload speed monitoring
- 🎯 **Auto-detection** - Automatically finds and plays video files
- 🌐 **Browser-based** - No additional software installation required

## Installation

1. **Clone or download** this repository to your local machine

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

4. **Open your browser** and navigate to:
   ```
   http://localhost:3000
   ```

## Usage

### Adding a Torrent

1. **Get a magnet link** from any torrent site
2. **Paste the magnet link** into the input field
3. **Click "Add Torrent"** or press Enter
4. **Wait for the torrent to load** - the video will start playing automatically

### Example Magnet Links

The app includes a sample magnet link for testing:
- **Sintel (Sample Video)** - A short animated film perfect for testing

### Features

- **Video Player**: Full HTML5 video controls with seek, volume, and fullscreen
- **Progress Tracking**: Real-time download progress and speed monitoring
- **Multiple Torrents**: Add and manage multiple torrents simultaneously
- **Auto-play**: Automatically plays the largest video file found in the torrent
- **Responsive Design**: Works on all screen sizes

## Technical Details

### Backend
- **Express.js** server with WebTorrent integration
- **Socket.io** for real-time communication
- **Streaming API** for video content delivery
- **CORS enabled** for cross-origin requests

### Frontend
- **Vanilla JavaScript** with modern ES6+ features
- **Responsive CSS** with gradient backgrounds and glassmorphism effects
- **HTML5 Video Player** with custom controls
- **Real-time updates** via WebSocket connection

### Dependencies
- `express` - Web server framework
- `webtorrent` - BitTorrent client for Node.js
- `socket.io` - Real-time bidirectional communication
- `cors` - Cross-origin resource sharing
- `magnet-uri` - Parse magnet links
- `parse-torrent` - Parse torrent files and magnet links

## API Endpoints

- `POST /api/torrent` - Add a new torrent
- `GET /api/stream/:infoHash` - Stream video content
- `DELETE /api/torrent/:infoHash` - Remove a torrent

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## Security Notes

- This application streams content directly from torrents
- Ensure you have the right to stream the content you're accessing
- The application does not store torrent files permanently
- All streaming is done in real-time without permanent storage

## Troubleshooting

### Common Issues

1. **Video not playing**: Ensure the torrent contains video files
2. **Slow loading**: Check your internet connection and torrent health
3. **Connection errors**: Verify the server is running on port 3000

### Performance Tips

- Use well-seeded torrents for better streaming performance
- Close unused torrents to free up bandwidth
- Ensure stable internet connection for smooth streaming

## Development

To run in development mode with auto-restart:

```bash
npm run dev
```

## License

MIT License - Feel free to use and modify as needed.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

---

**Enjoy streaming torrents without downloading!** 🎬✨
