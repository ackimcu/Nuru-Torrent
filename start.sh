#!/bin/bash

echo "🚀 Starting Nuru Torrent Streamer v1.0..."
echo "📁 Running from: $(pwd)"
echo "📦 Installing dependencies..."
npm install

echo "🌐 Starting server on http://localhost:3000"
echo "💡 Open your browser and navigate to the URL above"
echo "🎬 Paste a magnet link to start streaming!"
echo "⚙️  Server includes auto-restart capability via Settings modal"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Use the restart-enabled start script
./start-with-restart.sh
