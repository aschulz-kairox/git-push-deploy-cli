# git-push-deploy-cli (gpd)

Git Push Deploy - A CLI for git-based deployments with PM2 support. Push to deploy Node.js applications via SSH.

## Features

- **Git-based deployment**: Push to bare repo, server hook handles install
- **PM2 integration**: Automatic process restarts with user isolation
- **Lazy initialization**: Deploy repo created on first `gpd stage`
- **SSH orchestration**: Server setup from your dev machine
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
    "my-api-staging": {
      "sourceDir": "my-api",
      "deployRepo": "deploy/staging",
      "artifacts": ["dist/index.js", "package.json", "ecosystem.config.cjs"],
      "processManager": "pm2",
      "processName": "my-api-staging",
      "pm2Home": "/opt/myapp/.pm2",
      "pm2User": "myapp",
      "environment": "staging",
      "env": {
        "PORT": 5000,
        "NODE_ENV": "staging"
      },
      "server": {
        "host": "user@myserver",
        "sshOptions": "-p 22",
        "targetDir": "/opt/myapp/staging/my-api",
        "bareRepo": "/git/deploy-myapp/staging/my-api",
        "group": "deploy-myapp"
      }
    }
  }
}
```

### 2. Initialize server (once per service)

```bash
gpd init my-api-staging
```

This creates via SSH:
- Bare git repository at `/git/deploy-myapp/staging/my-api`
- Target directory at `/opt/myapp/staging/my-api`
- Post-receive hook that calls `gpd install`

### 3. Deploy

```bash
gpd deploy my-api-staging
```

This:
1. Creates deploy repo (if needed) at `my-api/deploy/staging/`
2. Copies build artifacts to deploy repo
3. Commits and pushes to bare repo on server
4. Server hook: `git checkout && npm install && pm2 restart`

## Commands

| Command | Description |
|---------|-------------|
| `gpd status` | Show all configured services |
| `gpd stage <service>` | Copy build artifacts to deploy repo |
| `gpd release <service>` | Commit and push deploy repo |
| `gpd deploy <service>` | Stage + release (hook handles install) |
| `gpd init <service>` | Initialize server (bare repo, target dir, hook) |
| `gpd install <service>` | Server-side install (called by hook) |
| `gpd logs <service>` | Show PM2 logs from server via SSH |

## Options

```bash
gpd deploy my-api -m "custom commit message"
gpd deploy my-api --skip-push      # Only stage, do not push
gpd logs my-api -f                 # Follow logs
gpd logs my-api -n 100             # Show last 100 lines
```

## Config Reference

```typescript
interface ServiceConfig {
  sourceDir: string;         // Project directory (e.g., "my-api")
  deployRepo: string;        // Deploy repo path, relative to sourceDir
  artifacts: string[];       // Files/dirs to copy
  processManager: 'pm2';     // Process manager type
  processName: string;       // PM2 process name
  pm2Home?: string;          // PM2_HOME on server
  pm2User?: string;          // User to run PM2 as (sudo -u)
  environment?: string;      // staging | production
  env?: Record<string, any>; // Environment variables for .env file
  server: {
    host: string;            // SSH host (user@hostname)
    sshOptions?: string;     // SSH options (e.g., "-p 6771 -4")
    targetDir: string;       // Target directory on server
    bareRepo: string;        // Bare repo path on server
    group?: string;          // Unix group for permissions
  };
}
```

## Architecture

```
Workspace                              Server
─────────                              ──────
my-api/
├── src/                               /git/deploy-myapp/staging/my-api/
├── dist/                                └── hooks/post-receive
└── deploy/                                   ↓
    └── staging/                       /opt/myapp/staging/my-api/
        ├── .git → ssh://...           ├── dist/index.js
        ├── dist/                      ├── package.json
        └── package.json               ├── node_modules/
                                       └── .env (generated)
```

## Workflow

```
Dev Machine                           Server
───────────                           ──────
gpd deploy my-api-staging
  │
  ├─ gpd stage
  │    └─ Copy artifacts → my-api/deploy/staging/
  │
  └─ gpd release  
       └─ git push ───────────────→ /git/deploy-myapp/staging/my-api
                                          │
                                          └─ post-receive hook:
                                               gpd install my-api-staging
                                                 │
                                                 ├─ git checkout -f
                                                 ├─ .env generation
                                                 ├─ npm install --omit=dev
                                                 └─ pm2 restart
```

## Server Prerequisites

- Node.js + npm
- PM2 (`npm install -g pm2`)
- gpd CLI (`npm install -g git-push-deploy-cli`)
- SSH access from dev machine
- Git

## License

MIT
