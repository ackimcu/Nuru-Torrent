#!/bin/bash

# Nuru Torrent Server with Auto-Restart
echo "🚀 Starting Nuru Torrent Server with auto-restart capability..."

# Function to start the server
start_server() {
    echo "📡 Starting server..."
    node server.js &
    SERVER_PID=$!
    echo "✅ Server started with PID: $SERVER_PID"
}

# Function to check for restart flag
check_restart() {
    if [ -f ".restart-flag" ]; then
        echo "🔄 Restart flag detected, restarting server..."
        rm -f .restart-flag
        kill $SERVER_PID 2>/dev/null
        sleep 2
        start_server
    fi
}

# Start the server initially
start_server

# Monitor for restart flag
while true; do
    sleep 1
    check_restart
    
    # Check if server is still running
    if ! kill -0 $SERVER_PID 2>/dev/null; then
        echo "❌ Server crashed, restarting..."
        start_server
    fi
done
