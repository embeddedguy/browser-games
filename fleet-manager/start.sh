#!/bin/bash
cd "$(dirname "$0")"
echo "============================================"
echo "  Fleet Asset Manager"
echo "============================================"

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies (first run only)..."
  npm install || { echo "ERROR: npm install failed."; exit 1; }
fi

echo ""
echo "Server starting..."
echo ""
echo "  Local:   http://localhost:3000"
echo "  Network: Use \`ipconfig\` (Windows) or \`ifconfig\` (Mac/Linux)"
echo ""
echo "Press Ctrl+C to stop."
echo "============================================"
node server.js
