#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Kill old server
lsof -ti :3099 | xargs kill -9 2>/dev/null
sleep 1

# Start server in background
cd /Users/tonyclaw/Projects/holdem-poker
npm run dev -- --port 3099 &> /tmp/holdem-dev.log &

# Wait until it responds, then open browser
echo "Starting..."
for i in {1..20}; do
  sleep 1
  if curl -s http://localhost:3099 > /dev/null 2>&1; then
    open http://localhost:3099
    echo "Game opened at http://localhost:3099"
    exit 0
  fi
done
echo "Failed to start. Check /tmp/holdem-dev.log"
