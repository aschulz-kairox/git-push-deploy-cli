# git-push-deploy-cli (gpd)

Git Push Deploy - A CLI for git-based deployments with PM2 support. Push to deploy Node.js applications via SSH.

## Features

- **Git-based deployment**: Push to bare repo, SSH triggers install
- **PM2 integration**: Automatic process restarts
- **Monorepo support**: Stage multiple packages for deployment
- **SSH orchestration**: Everything runs from your dev machine
- **Config-driven**: Define services in `.git-deploy.json`

## Installation

```bash
npm install -g git-push-deploy-cli
```

## Quick Start

### 1. Create `.git-deploy.json` in your workspace root:

```json
{
  "services": {
    "my-api": {
      "packages": ["my-api"],
      "mainPackage": "my-api",
      "deployRepo": "../deploy-my-api",
      "processName": "my-api",
      "pm2Home": "/opt/myapp/.pm2",
      "artifacts": ["dist", "package.json", "package-lock.json", "ecosystem.config.cjs"],
      "server": {
        "host": "user@myserver",
        "targetDir": "/opt/myapp/my-api",
        "bareRepo": "/git/deploy-my-api"
      }
    }
  }
}
```

### 2. Initialize server (once per service)

```bash
gpd init my-api
```

This creates via SSH:
- Bare git repository at `/git/deploy-my-api`
- Clone at `/opt/myapp/my-api`

### 3. Deploy

```bash
gpd deploy my-api
```

This:
1. Copies build artifacts to local deploy repo
2. Commits and pushes to bare repo on server
3. SSH: `git pull && npm install && pm2 restart`

## Commands

| Command | Description |
|---------|-------------|
| `gpd status` | Show all configured services |
| `gpd stage <service>` | Copy build artifacts to deploy repo |
| `gpd release <service>` | Commit and push deploy repo |
| `gpd deploy <service>` | Stage + release + SSH install |
| `gpd init <service>` | Initialize bare repo and clone on server |
| `gpd logs <service>` | Show PM2 logs from server via SSH |

## Options

```bash
gpd deploy my-api -m "custom commit message"
gpd deploy my-api --skip-remote    # Only stage and release, no SSH
gpd logs my-api -f                 # Follow logs
gpd logs my-api -n 100             # Show last 100 lines
```

## Config Reference

```typescript
interface ServiceConfig {
  packages: string[];        // Packages to deploy (monorepo)
  mainPackage: string;       // Package with ecosystem.config.cjs
  deployRepo: string;        // Local deploy repo path
  processName: string;       // PM2 process name
  pm2Home?: string;          // PM2_HOME on server
  artifacts?: string[];      // Files to copy (default: dist, package.json, etc.)
  server: {
    host: string;            // SSH host (user@hostname)
    targetDir: string;       // Clone directory on server
    bareRepo: string;        // Bare repo path on server
  };
}
```

## Workflow

```
Dev Machine                           Server
───────────                           ──────
gpd deploy my-api
  │
  ├─ gpd stage
  │    └─ Copy artifacts → ../deploy-my-api/
  │
  ├─ gpd release  
  │    └─ git push ──────────────────→ /git/deploy-my-api (bare)
  │
  └─ SSH ────────────────────────────→ cd /opt/myapp/my-api
                                       git pull
                                       npm install --omit=dev
                                       pm2 restart my-api
```

## Server Prerequisites

- Node.js + npm
- PM2 (`npm install -g pm2`)
- SSH access from dev machine
- Git

No gpd installation needed on the server!

## License

MIT
