import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import type { DeployConfig, ServiceConfig } from './types.js';

const CONFIG_FILENAME = '.git-deploy.json';

/**
 * Find config file by walking up directory tree
 */
export function findConfigFile(startDir: string = process.cwd()): string | null {
  let currentDir = startDir;
  
  while (currentDir !== dirname(currentDir)) {
    const configPath = join(currentDir, CONFIG_FILENAME);
    if (existsSync(configPath)) {
      return configPath;
    }
    currentDir = dirname(currentDir);
  }
  
  return null;
}

/**
 * Load and parse config file
 */
export function loadConfig(configPath?: string): DeployConfig {
  const path = configPath || findConfigFile();
  
  if (!path) {
    throw new Error(`Config file ${CONFIG_FILENAME} not found. Run from workspace root or specify path.`);
  }
  
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as DeployConfig;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${path}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get configuration for a specific service
 */
export function getServiceConfig(serviceName: string, configPath?: string): ServiceConfig {
  const config = loadConfig(configPath);
  const serviceConfig = config.services[serviceName];
  
  if (!serviceConfig) {
    const available = Object.keys(config.services).join(', ');
    throw new Error(`Service '${serviceName}' not found in config. Available: ${available}`);
  }
  
  return serviceConfig;
}

/**
 * Get workspace root (directory containing .git-deploy.json)
 */
export function getWorkspaceRoot(): string {
  const configPath = findConfigFile();
  if (!configPath) {
    throw new Error(`Config file ${CONFIG_FILENAME} not found.`);
  }
  return dirname(configPath);
}

/**
 * Get absolute path to source directory
 * @param config Service configuration
 * @param workspaceRoot Workspace root path
 * @returns Absolute path to sourceDir (e.g., /workspace/kairox-api-node)
 */
export function getSourceDir(config: ServiceConfig, workspaceRoot: string): string {
  return join(workspaceRoot, config.sourceDir);
}

/**
 * Get absolute path to deploy repository
 * @param config Service configuration  
 * @param workspaceRoot Workspace root path
 * @returns Absolute path to deployRepo (e.g., /workspace/kairox-api-node/deploy/staging)
 */
export function getDeployRepoPath(config: ServiceConfig, workspaceRoot: string): string {
  return join(workspaceRoot, config.sourceDir, config.deployRepo);
}

/**
 * List all configured services
 */
export function listServices(configPath?: string): string[] {
  const config = loadConfig(configPath);
  return Object.keys(config.services);
}
