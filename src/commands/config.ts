import chalk from 'chalk';
import * as readline from 'readline';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { getServers, type DeployConfig, type ServiceConfig, type ServerConfig } from '../config/types.js';

const CONFIG_FILENAME = '.git-deploy.json';

/**
 * Get the primary server from config (handles both server and servers)
 */
function getExistingServer(config?: ServiceConfig): ServerConfig | undefined {
  if (!config) return undefined;
  if (config.servers && config.servers.length > 0) return config.servers[0];
  return config.server;
}

/**
 * Create readline interface
 */
function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Prompt for input with default value
 */
async function prompt(rl: readline.Interface, question: string, defaultValue?: string): Promise<string> {
  const defaultText = defaultValue ? chalk.gray(` [${defaultValue}]`) : '';
  
  return new Promise((resolve) => {
    rl.question(`${question}${defaultText}: `, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * Prompt for yes/no
 */
async function promptYesNo(rl: readline.Interface, question: string, defaultYes: boolean = true): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  
  return new Promise((resolve) => {
    rl.question(`${question} ${hint}: `, (answer) => {
      if (!answer.trim()) {
        resolve(defaultYes);
      } else {
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      }
    });
  });
}

/**
 * Prompt for selection from list
 */
async function promptSelect(rl: readline.Interface, question: string, options: string[], defaultIndex: number = 0): Promise<string> {
  console.log(question);
  options.forEach((opt, i) => {
    const marker = i === defaultIndex ? chalk.green('→') : ' ';
    console.log(`  ${marker} ${i + 1}) ${opt}`);
  });
  
  return new Promise((resolve) => {
    rl.question(`Select (1-${options.length}) [${defaultIndex + 1}]: `, (answer) => {
      if (!answer.trim()) {
        resolve(options[defaultIndex]);
      } else {
        const num = parseInt(answer, 10);
        if (num >= 1 && num <= options.length) {
          resolve(options[num - 1]);
        } else {
          resolve(options[defaultIndex]);
        }
      }
    });
  });
}

/**
 * Load existing config or create empty one
 */
function loadOrCreateConfig(configPath: string): DeployConfig {
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      console.log(chalk.yellow('Warning: Could not parse existing config, starting fresh'));
    }
  }
  return { services: {} };
}

/**
 * Save config to file
 */
function saveConfig(configPath: string, config: DeployConfig): void {
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Interactive wizard to create/edit service configuration
 */
async function createServiceConfig(rl: readline.Interface, existingConfig?: ServiceConfig): Promise<ServiceConfig> {
  console.log('');
  console.log(chalk.blue.bold('Service Configuration'));
  console.log(chalk.gray('─'.repeat(40)));
  
  // Source and deploy
  const sourceDir = await prompt(rl, 'Source directory (relative to workspace)', existingConfig?.sourceDir || '.');
  const deployRepo = await prompt(rl, 'Deploy repo path (relative to source)', existingConfig?.deployRepo || 'deploy');
  
  // Artifacts
  console.log('');
  const defaultArtifacts = existingConfig?.artifacts?.join(', ') || 'dist, package.json, ecosystem.config.cjs';
  const artifactsStr = await prompt(rl, 'Artifacts to deploy (comma-separated)', defaultArtifacts);
  const artifacts = artifactsStr.split(',').map(a => a.trim()).filter(a => a);
  
  // Process manager
  console.log('');
  const processManager = await promptSelect(rl, 'Process manager:', ['pm2', 'gpdd', 'systemd'], 0) as 'pm2' | 'gpdd' | 'systemd';
  const processName = await prompt(rl, 'Process name', existingConfig?.processName || 'my-service');
  
  // PM2 specific
  let pm2Home: string | undefined;
  let pm2User: string | undefined;
  if (processManager === 'pm2') {
    const usePm2User = await promptYesNo(rl, 'Run PM2 as different user (sudo -u)?', !!existingConfig?.pm2User);
    if (usePm2User) {
      pm2User = await prompt(rl, 'PM2 user', existingConfig?.pm2User || 'deploy');
      pm2Home = await prompt(rl, 'PM2_HOME directory', existingConfig?.pm2Home || `/opt/${processName}/.pm2`);
    }
  }
  
  // GPDD specific
  let gpddWorkers: number | undefined;
  let gpddEntryPoint: string | undefined;
  if (processManager === 'gpdd') {
    const workersStr = await prompt(rl, 'Number of workers (0 = CPU count)', String(existingConfig?.gpddWorkers || 0));
    gpddWorkers = parseInt(workersStr, 10) || undefined;
    gpddEntryPoint = await prompt(rl, 'Entry point', existingConfig?.gpddEntryPoint || 'dist/index.js');
    
    // gpdd also supports running as different user
    const useGpddUser = await promptYesNo(rl, 'Run GPDD as different user (sudo -u)?', !!existingConfig?.pm2User);
    if (useGpddUser) {
      pm2User = await prompt(rl, 'User', existingConfig?.pm2User || 'deploy');
    }
  }
  
  // Environment
  console.log('');
  const environment = await promptSelect(rl, 'Environment:', ['production', 'staging', 'development'], 0) as 'production' | 'staging' | 'development';
  
  // Server config
  console.log('');
  console.log(chalk.blue('Server Configuration'));
  console.log(chalk.gray('─'.repeat(40)));
  
  const host = await prompt(rl, 'SSH host (user@hostname)', getExistingServer(existingConfig)?.host || 'deploy@localhost');
  const sshOptions = await prompt(rl, 'SSH options (e.g., -p 22)', getExistingServer(existingConfig)?.sshOptions || '');
  const targetDir = await prompt(rl, 'Target directory on server', getExistingServer(existingConfig)?.targetDir || `/opt/${processName}`);
  const bareRepo = await prompt(rl, 'Bare repo path on server', getExistingServer(existingConfig)?.bareRepo || `/git/deploy-${processName}`);
  
  const useGroup = await promptYesNo(rl, 'Use shared Unix group?', !!getExistingServer(existingConfig)?.group);
  const group = useGroup ? await prompt(rl, 'Group name', getExistingServer(existingConfig)?.group || 'deploy') : undefined;
  
  // Environment variables
  console.log('');
  const addEnvVars = await promptYesNo(rl, 'Add environment variables?', !!existingConfig?.env);
  let env: Record<string, string | number | boolean> | undefined;
  
  if (addEnvVars) {
    env = existingConfig?.env ? { ...existingConfig.env } : {};
    console.log(chalk.gray('Enter variables as KEY=VALUE, empty line to finish'));
    
    while (true) {
      const varInput = await prompt(rl, 'ENV_VAR=value');
      if (!varInput) break;
      
      const [key, ...valueParts] = varInput.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=');
        // Try to parse as number or boolean
        if (value === 'true') {
          env[key] = true;
        } else if (value === 'false') {
          env[key] = false;
        } else if (/^\d+$/.test(value)) {
          env[key] = parseInt(value, 10);
        } else {
          env[key] = value;
        }
      }
    }
  }
  
  // Build server config
  const serverConfig: ServerConfig = {
    host,
    targetDir,
    bareRepo,
  };
  if (sshOptions) serverConfig.sshOptions = sshOptions;
  if (group) serverConfig.group = group;
  
  const config: ServiceConfig = {
    sourceDir,
    deployRepo,
    artifacts,
    processManager,
    processName,
    environment,
    server: serverConfig
  };
  
  if (pm2Home) config.pm2Home = pm2Home;
  if (pm2User) config.pm2User = pm2User;
  if (gpddWorkers) config.gpddWorkers = gpddWorkers;
  if (gpddEntryPoint && gpddEntryPoint !== 'dist/index.js') config.gpddEntryPoint = gpddEntryPoint;
  if (env && Object.keys(env).length > 0) config.env = env;
  
  return config;
}

interface ConfigOptions {
  edit?: string;
  list?: boolean;
}

/**
 * Config command - create or edit .git-deploy.json
 */
export async function configCommand(options: ConfigOptions = {}): Promise<void> {
  const configPath = join(process.cwd(), CONFIG_FILENAME);
  const config = loadOrCreateConfig(configPath);
  
  // List mode
  if (options.list) {
    if (Object.keys(config.services).length === 0) {
      console.log(chalk.yellow('No services configured'));
    } else {
      console.log(chalk.blue('Configured services:'));
      for (const [name, svc] of Object.entries(config.services)) {
        const servers = getServers(svc);
        console.log(`  ${chalk.white(name)}`);
        if (servers.length === 1) {
          console.log(chalk.gray(`    Host: ${servers[0].host}`));
          console.log(chalk.gray(`    Target: ${servers[0].targetDir}`));
        } else {
          console.log(chalk.gray(`    Servers: ${servers.length}`));
          for (const server of servers) {
            const label = server.name || server.host;
            console.log(chalk.gray(`      - ${label}: ${server.targetDir}`));
          }
        }
      }
    }
    return;
  }
  
  const rl = createPrompt();
  
  try {
    console.log(chalk.blue.bold('GPD Configuration Wizard'));
    console.log(chalk.gray(`Config file: ${configPath}`));
    console.log('');
    
    // Service name
    let serviceName: string;
    if (options.edit) {
      serviceName = options.edit;
      if (!config.services[serviceName]) {
        console.log(chalk.yellow(`Service '${serviceName}' not found, creating new`));
      }
    } else {
      const existingServices = Object.keys(config.services);
      if (existingServices.length > 0) {
        console.log(chalk.gray('Existing services: ' + existingServices.join(', ')));
      }
      serviceName = await prompt(rl, 'Service name', existingServices[0] || 'my-service');
    }
    
    // Create/edit service config
    const existingService = config.services[serviceName];
    const serviceConfig = await createServiceConfig(rl, existingService);
    
    // Preview
    console.log('');
    console.log(chalk.blue.bold('Configuration Preview'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(JSON.stringify({ [serviceName]: serviceConfig }, null, 2));
    console.log('');
    
    // Confirm save
    const shouldSave = await promptYesNo(rl, 'Save configuration?', true);
    
    if (shouldSave) {
      config.services[serviceName] = serviceConfig;
      saveConfig(configPath, config);
      console.log(chalk.green(`✓ Saved to ${CONFIG_FILENAME}`));
      console.log('');
      console.log(chalk.gray('Next steps:'));
      console.log(chalk.white(`  gpd init ${serviceName}    # Setup server`));
      console.log(chalk.white(`  gpd deploy ${serviceName}  # Deploy`));
    } else {
      console.log(chalk.yellow('Cancelled'));
    }
  } finally {
    rl.close();
  }
}
