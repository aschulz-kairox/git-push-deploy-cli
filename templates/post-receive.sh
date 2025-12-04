#!/bin/bash
# Post-receive hook template
# Copy this to your bare repo: hooks/post-receive
# Or use: git-deploy init <service>

set -e

# Configuration - adjust these values
SERVICE="my-service"
TARGET_DIR="/opt/myapp/my-service"
LOG_FILE="/var/log/deploy-my-service.log"
PM2_NAME="my-service"
PM2_HOME="/opt/myapp/.pm2"
PACKAGES=("my-service")
MAIN_PKG="my-service"
USER="myapp"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | sudo tee -a "$LOG_FILE"
}

log "=== Deployment started ==="

while read oldrev newrev refname; do
    BRANCH=$(echo "$refname" | sed 's|refs/heads/||')
    log "Received push to branch: $BRANCH"
    
    if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; then
        log "Ignoring non-main branch"
        continue
    fi

    # Extract packages using git archive
    for pkg in "${PACKAGES[@]}"; do
        log "Extracting $pkg..."
        git archive "$BRANCH" "$pkg/" 2>/dev/null | sudo tar -x -C "$TARGET_DIR/" || true
    done

    # Set ownership
    sudo chown -R $USER:$USER "$TARGET_DIR"

    # Install dependencies
    log "Installing dependencies..."
    cd "$TARGET_DIR/$MAIN_PKG"
    sudo -u $USER npm install --omit=dev 2>&1 | sudo tee -a "$LOG_FILE"

    # Restart PM2
    log "Restarting $PM2_NAME..."
    sudo -u $USER PM2_HOME=$PM2_HOME pm2 restart "$PM2_NAME" --no-color 2>&1 | sudo tee -a "$LOG_FILE"
    
    log "Current status:"
    sudo -u $USER PM2_HOME=$PM2_HOME pm2 list --no-color 2>&1 | sudo tee -a "$LOG_FILE"
done

log "=== Deployment completed ==="
