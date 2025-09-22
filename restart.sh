#!/bin/bash

# Nuru Torrent Server Restart Script
echo "🔄 Restarting Nuru Torrent Server..."

# Kill any existing node processes running server.js
pkill -f "node server.js" 2>/dev/null

# Wait a moment for the process to fully terminate
sleep 2

# Start the server again
echo "🚀 Starting Nuru Torrent Server..."
node server.js &

# Get the process ID
SERVER_PID=$!
echo "✅ Server restarted with PID: $SERVER_PID"

# Wait a moment for the server to start
sleep 3

# Check if the server is running
if ps -p $SERVER_PID > /dev/null; then
    echo "✅ Server is running successfully on port 3000"
else
    echo "❌ Failed to start server"
    exit 1
fi
