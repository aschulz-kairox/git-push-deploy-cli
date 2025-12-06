import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import chalk from 'chalk';
import type { DeployConfig, ServiceConfig } from './types.js';

export const CONFIG_FILENAME = '.git-deploy.json';

/**
 * Pattern for environment variable substitution: ${VAR_NAME}
 */
const ENV_VAR_PATTERN = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

/**
 * Patterns that suggest sensitive values that should use env vars
 */
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
  /webhook[_-]?url/i,
];

/**
 * Substitute environment variables in a string
 * Supports ${VAR_NAME} syntax
 * @param value String that may contain ${VAR} patterns
 * @returns String with env vars substituted
 * @throws Error if referenced env var is not set
 */
export function substituteEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (match, varName) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      throw new Error(`Environment variable ${varName} is not set (referenced in config as \${${varName}})`);
    }
    return envValue;
  });
}

/**
 * Recursively substitute env vars in an object
 */
function substituteEnvVarsInObject<T>(obj: T): T {
  if (typeof obj === 'string') {
    return substituteEnvVars(obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => substituteEnvVarsInObject(item)) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVarsInObject(value);
    }
    return result as T;
  }
  return obj;
}

/**
 * Check for sensitive values that should use environment variables
 * Warns if hardcoded secrets are detected
 */
function warnAboutSensitiveValues(config: DeployConfig, configPath: string): void {
  const warnings: string[] = [];
  
  function checkValue(value: unknown, path: string): void {
    if (typeof value === 'string') {
      // Skip if already using env var substitution
      if (ENV_VAR_PATTERN.test(value)) return;
      
      // Check if the key suggests this is sensitive
      const keyName = path.split('.').pop() || '';
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(keyName) && value.length > 0) {
          // Don't warn about obviously non-secret values
          if (!value.startsWith('http://localhost') && value !== 'production' && value !== 'staging') {
            warnings.push(`  ${path}: Consider using \${ENV_VAR} instead of hardcoded value`);
          }
          break;
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => checkValue(item, `${path}[${index}]`));
    } else if (value !== null && typeof value === 'object') {
      for (const [key, val] of Object.entries(value)) {
        checkValue(val, path ? `${path}.${key}` : key);
      }
    }
  }
  
  checkValue(config, '');
  
  if (warnings.length > 0) {
    console.log(chalk.yellow('\n⚠ Security warning: Possible hardcoded secrets detected in config:'));
    warnings.forEach(w => console.log(chalk.yellow(w)));
    console.log(chalk.gray(`  File: ${configPath}`));
    console.log(chalk.gray('  Tip: Use ${ENV_VAR} syntax for sensitive values\n'));
  }
}

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
 * Performs env var substitution and security checks
 */
export function loadConfig(configPath?: string): DeployConfig {
  const path = configPath || findConfigFile();
  
  if (!path) {
    throw new Error(`Config file ${CONFIG_FILENAME} not found. Run from workspace root or specify path.`);
  }
  
  try {
    const content = readFileSync(path, 'utf-8');
    const rawConfig = JSON.parse(content) as DeployConfig;
    
    // Warn about hardcoded secrets before substitution
    warnAboutSensitiveValues(rawConfig, path);
    
    // Substitute environment variables
    const config = substituteEnvVarsInObject(rawConfig);
    
    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${path}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Validation patterns for shell-safe values
 * These prevent shell injection attacks
 */
const VALID_HOST_PATTERN = /^[a-zA-Z0-9._@:-]+$/;
const VALID_USER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const VALID_PROCESS_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const VALID_PATH_PATTERN = /^[a-zA-Z0-9_./-]+$/;

/**
 * Validate a value against a pattern
 * @throws Error if validation fails
 */
function validateValue(value: string, pattern: RegExp, fieldName: string): void {
  if (!pattern.test(value)) {
    throw new Error(`Invalid ${fieldName}: "${value}". Contains unsafe characters.`);
  }
}

/**
 * Validate service config for shell-safe values
 * Prevents command injection via config values
 */
function validateServiceConfig(serviceName: string, config: ServiceConfig): void {
  // Validate process name
  if (config.processName) {
    validateValue(config.processName, VALID_PROCESS_NAME_PATTERN, 'processName');
  }
  
  // Validate pm2User
  if (config.pm2User) {
    validateValue(config.pm2User, VALID_USER_PATTERN, 'pm2User');
  }
  
  // Validate server configs
  const servers = config.servers || (config.server ? [config.server] : []);
  for (const server of servers) {
    validateValue(server.host, VALID_HOST_PATTERN, 'server.host');
    validateValue(server.targetDir, VALID_PATH_PATTERN, 'server.targetDir');
    validateValue(server.bareRepo, VALID_PATH_PATTERN, 'server.bareRepo');
    if (server.group) {
      validateValue(server.group, VALID_USER_PATTERN, 'server.group');
    }
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
  
  // Validate config values are shell-safe
  validateServiceConfig(serviceName, serviceConfig);
  
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
