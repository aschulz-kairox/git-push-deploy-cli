/**
 * Process manager type
 */
export type ProcessManagerType = 'pm2' | 'systemd' | 'gpdd';

/**
 * Environment type for deployment
 */
export type EnvironmentType = 'production' | 'staging' | 'development';

/**
 * Hooks configuration for pre/post deployment scripts
 */
export interface HooksConfig {
  /** Commands to run locally before deployment (before git push) */
  preDeploy?: string[];
  
  /** Commands to run on server after deployment (after npm install) */
  postDeploy?: string[];
  
  /** Commands to run locally after successful deployment */
  postDeployLocal?: string[];
}

/**
 * Slack notification configuration
 */
export interface SlackNotificationConfig {
  /** Slack webhook URL */
  webhookUrl: string;
  /** Channel override (optional, uses webhook default) */
  channel?: string;
  /** Username override */
  username?: string;
  /** Only notify on failure */
  onlyOnFailure?: boolean;
}

/**
 * Discord notification configuration
 */
export interface DiscordNotificationConfig {
  /** Discord webhook URL */
  webhookUrl: string;
  /** Username override */
  username?: string;
  /** Only notify on failure */
  onlyOnFailure?: boolean;
}

/**
 * Generic webhook notification configuration
 */
export interface WebhookNotificationConfig {
  /** Webhook URL */
  url: string;
  /** HTTP method (default: POST) */
  method?: 'POST' | 'PUT';
  /** Additional headers */
  headers?: Record<string, string>;
  /** Only notify on failure */
  onlyOnFailure?: boolean;
}

/**
 * Notification configuration
 */
export interface NotificationsConfig {
  /** Slack notifications */
  slack?: SlackNotificationConfig;
  /** Discord notifications */
  discord?: DiscordNotificationConfig;
  /** Generic webhook */
  webhook?: WebhookNotificationConfig;
}

/**
 * Deployment result for notifications
 */
export interface DeploymentResult {
  service: string;
  environment?: string;
  servers: string[];
  success: boolean;
  message?: string;
  timestamp: string;
  duration?: number;
  commitHash?: string;
  commitMessage?: string;
}

/**
 * Server configuration for deployment target
 */
export interface ServerConfig {
  /** SSH host (user@hostname) */
  host: string;

  /** Additional SSH options (e.g., "-p 6771 -4") */
  sshOptions?: string;

  /** Where to install on server (target directory) */
  targetDir: string;

  /** Path to bare git repo on server */
  bareRepo: string;

  /** Unix group for shared access (created if not exists) */
  group?: string;
  
  /** Server-specific name/label (optional, for display) */
  name?: string;
}

/**
 * Service configuration for git-deploy
 * 
 * New architecture: deploy/ folder inside source project
 * Example:
 *   sourceDir: "kairox-api-node"
 *   deployRepo: "deploy/staging"  (relative to sourceDir)
 *   → Full path: workspace/kairox-api-node/deploy/staging
 */
export interface ServiceConfig {
  /** Source directory containing the project (relative to workspace root) */
  sourceDir: string;

  /** Path to deploy repository (relative to sourceDir) */
  deployRepo: string;

  /** Files/dirs to copy to deploy repo */
  artifacts: string[];

  /** Process manager type (default: 'pm2') */
  processManager?: ProcessManagerType;

  /** Process name (PM2 name or systemd service name) */
  processName: string;

  /** PM2 home directory on server */
  pm2Home?: string;

  /** User to run PM2 commands as (via sudo -u) */
  pm2User?: string;

  /** GPDD: Number of workers (default: CPU count) */
  gpddWorkers?: number;

  /** GPDD: App entry point (default: dist/index.js) */
  gpddEntryPoint?: string;

  /** GPDD: Ready check URL (polled until healthy to mark worker as ready) */
  gpddReadyUrl?: string;

  /** GPDD: Health check URL (ongoing monitoring after ready) */
  gpddHealthUrl?: string;

  /** Environment type (production, staging, development) */
  environment?: EnvironmentType;

  /** Environment variables to write to .env file on server */
  env?: Record<string, string | number | boolean>;

  /** Deployment hooks (pre-deploy, post-deploy scripts) */
  hooks?: HooksConfig;

  /** Notification settings */
  notifications?: NotificationsConfig;

  /** Server-side configuration (single server) */
  server?: ServerConfig;
  
  /** Multiple servers for parallel deployment */
  servers?: ServerConfig[];

  // Legacy fields for backwards compatibility
  /** @deprecated Use sourceDir instead */
  packages?: string[];
  /** @deprecated Use sourceDir instead */
  mainPackage?: string;
}

/**
 * Root configuration file (.git-deploy.json)
 */
export interface DeployConfig {
  /** Port ranges for different environments (informational) */
  portRanges?: Record<string, Record<string, number>>;
  
  services: Record<string, ServiceConfig>;
}

/**
 * Default artifacts to copy if not specified
 */
export const DEFAULT_ARTIFACTS = [
  'dist',
  'package.json',
  'ecosystem.config.cjs'
];

/**
 * Get all servers from a service config
 * Handles both single 'server' and multiple 'servers' config
 */
export function getServers(config: ServiceConfig): ServerConfig[] {
  if (config.servers && config.servers.length > 0) {
    return config.servers;
  }
  if (config.server) {
    return [config.server];
  }
  throw new Error('No server configuration found. Specify either "server" or "servers" in config.');
}

/**
 * Get the primary server (first one) from config
 */
export function getPrimaryServer(config: ServiceConfig): ServerConfig {
  const servers = getServers(config);
  return servers[0];
}

/**
 * Parse SSH options to extract port
 * @param sshOptions e.g. "-p 6771 -4"
 * @returns port number or undefined
 */
export function parseSshPort(sshOptions?: string): number | undefined {
  if (!sshOptions) return undefined;
  const match = sshOptions.match(/-p\s*(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Build SSH URL for git remote
 * @param host e.g. "aschulz@symbio-raspi5"
 * @param bareRepo e.g. "/git/sym/deploy-kairox/staging/kairox-api"
 * @param port e.g. 6771
 * @returns e.g. "ssh://aschulz@symbio-raspi5:6771/git/sym/deploy-kairox/staging/kairox-api"
 */
export function buildSshUrl(host: string, bareRepo: string, port?: number): string {
  if (port) {
    return `ssh://${host}:${port}${bareRepo}`;
  }
  return `ssh://${host}${bareRepo}`;
}
