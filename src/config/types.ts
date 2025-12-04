import type { ProcessManagerType } from '../utils/process-manager.js';

/**
 * Service configuration for git-deploy
 */
export interface ServiceConfig {
  /** Packages to deploy (monorepo support) */
  packages: string[];
  
  /** Package with package.json for npm install */
  mainPackage: string;
  
  /** Path to local deploy repository (relative to workspace root) */
  deployRepo: string;
  
  /** Process manager type (default: 'pm2') */
  processManager?: ProcessManagerType;
  
  /** Process name (PM2 name or systemd service name) */
  processName: string;
  
  /** PM2 home directory (optional, only for PM2) */
  pm2Home?: string;
  
  /** Files/dirs to copy (default: dist, package.json, package-lock.json) */
  artifacts?: string[];
  
  /** Server-side configuration */
  server: {
    /** Where to install on server */
    targetDir: string;
    
    /** Path to bare git repo on server */
    bareRepo: string;
    
    /** Unix user for file ownership */
    user?: string;
    
    /** Unix group (default: deploy-<service>) */
    group?: string;
  };
}

/**
 * Root configuration file (.git-deploy.json)
 */
export interface DeployConfig {
  services: Record<string, ServiceConfig>;
}

/**
 * Default artifacts to copy if not specified
 */
export const DEFAULT_ARTIFACTS = [
  'dist',
  'package.json',
  'package-lock.json',
  'ecosystem.config.cjs'
];
