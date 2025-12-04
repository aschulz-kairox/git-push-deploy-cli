# git-push-deploy-cli (gpd)

Git Push Deploy - A CLI for git-based deployments with PM2/systemd support. Push to deploy Node.js applications using bare git repositories and post-receive hooks.

## Features

- **Git-based deployment**: Push to deploy using bare repositories
- **PM2 integration**: Automatic process management and restarts
- **Monorepo support**: Stage multiple packages for deployment
- **Cross-platform**: Works on Linux servers and Windows/Mac dev machines
- **Config-driven**: Define services in `.git-deploy.json`

## Installation

```bash
# Global installation (recommended for servers)
npm install -g git-push-deploy-cli

# Or use npx
npx git-push-deploy-cli <command>
```

## Quick Start

### 1. Create config file

Create `.git-deploy.json` in your workspace root:

```json
{
  "services": {
    "my-api": {
      "packages": ["my-api"],
      "mainPackage": "my-api",
      "deployRepo": "../deploy-my-api",
      "pm2Name": "my-api",
      "server": {
        "targetDir": "/opt/myapp/my-api",
        "bareRepo": "/git/deploy-my-api",
        "user": "myapp"
      }
    }
  }
}
```

### 2. Initialize server (once per service)

```bash
# On the server
sudo gpd init my-api
```

This creates:
- Bare git repository at `/git/deploy-my-api`
- Post-receive hook for automatic deployment
- Log file at `/var/log/deploy-my-api.log`
- Unix group `deploy-my-api` with appropriate permissions

### 3. Deploy from dev machine

```bash
# Build, stage, and push
gpd deploy my-api

# Or step by step:
gpd stage my-api    # Copy build artifacts to deploy repo
gpd release my-api  # Commit and push
```

## Commands

### Development Commands

| Command | Description |
|---------|-------------|
| `gpd stage <service>` | Copy build artifacts to deploy repo |
| `gpd release <service>` | Commit and push deploy repo |
| `gpd deploy <service>` | Stage + release in one step |

### Server Commands

| Command | Description |
|---------|-------------|
| `gpd init <service>` | Initialize bare repo, hook, and permissions |
| `gpd install <service>` | Extract, npm install, pm2 restart (used by hook) |
| `gpd status` | Show all services and PM2 status |
| `gpd logs <service>` | Show deployment logs |

## Configuration

### .git-deploy.json

```json
{
  "services": {
    "<service-name>": {
      "packages": ["pkg1", "pkg2"],
      "mainPackage": "pkg1",
      "deployRepo": "../deploy-<service>",
      "pm2Name": "<pm2-process-name>",
      "pm2Home": "/opt/myapp/.pm2",
      "artifacts": ["dist", "package.json", "package-lock.json"],
      "server": {
        "targetDir": "/opt/myapp/<service>",
        "bareRepo": "/git/deploy-<service>",
        "user": "myapp",
        "group": "deploy-<service>"
      }
    }
  }
}
```

### Configuration Options

| Option | Required | Description |
|--------|----------|-------------|
| `packages` | Yes | Packages to deploy (monorepo support) |
| `mainPackage` | Yes | Package with package.json for npm install |
| `deployRepo` | Yes | Path to local deploy repository |
| `pm2Name` | Yes | PM2 process name |
| `pm2Home` | No | PM2 home directory (default: ~/.pm2) |
| `artifacts` | No | Files/dirs to copy (default: dist, package.json, package-lock.json) |
| `server.targetDir` | Yes | Where to install on server |
| `server.bareRepo` | Yes | Path to bare git repo on server |
| `server.user` | No | Unix user for file ownership |
| `server.group` | No | Unix group (default: deploy-<service>) |

## How It Works

```
[Dev Machine]                    [Server]
     │                               │
     │  npm run build                │
     ▼                               │
┌─────────────┐                      │
│ dist/       │                      │
│ package.json│                      │
└─────────────┘                      │
     │                               │
     │  git-deploy stage             │
     ▼                               │
┌─────────────┐                      │
│ deploy-repo/│                      │
│  └─ my-api/ │                      │
└─────────────┘                      │
     │                               │
     │  git-deploy release           │
     │  (git push)                   │
     ▼                               ▼
              ─────────────────────►
                                ┌─────────────┐
                                │ bare repo   │
                                │ post-receive│
                                └─────────────┘
                                     │
                                     │  git-deploy install
                                     ▼
                                ┌─────────────┐
                                │ /opt/myapp/ │
                                │ npm install │
                                │ pm2 restart │
                                └─────────────┘
```

## Integration with npm scripts

```json
{
  "scripts": {
    "predeploy": "npm version patch && npm run build",
    "deploy": "gpd deploy my-api"
  }
}
```

## Requirements

- Node.js >= 18
- Git
- PM2 (on server)
- Linux server (Debian, Ubuntu, Raspberry Pi OS, etc.)

## License

MIT
