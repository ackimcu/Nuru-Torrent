#!/usr/bin/env node

// Nuru Torrent Server Restart Script
const { spawn, exec } = require('child_process');
const path = require('path');

console.log('🔄 Restarting Nuru Torrent Server...');

// Kill any existing node processes running server.js
exec('pkill -f "node server.js"', (error) => {
  if (error && !error.message.includes('No matching processes')) {
    console.log('Warning:', error.message);
  }
  
  // Wait a moment for processes to terminate
  setTimeout(() => {
    console.log('🚀 Starting Nuru Torrent Server...');
    
    // Start the server
    const serverProcess = spawn('node', ['server.js'], {
      cwd: __dirname,
      stdio: 'inherit',
      detached: true
    });
    
    serverProcess.on('error', (err) => {
      console.error('❌ Failed to start server:', err);
      process.exit(1);
    });
    
    serverProcess.on('exit', (code) => {
      console.log(`Server process exited with code ${code}`);
    });
    
    // Unref the process so the restart script can exit
    serverProcess.unref();
    
    console.log('✅ Server restart completed');
    
    // Exit the restart script
    process.exit(0);
  }, 2000);
});
