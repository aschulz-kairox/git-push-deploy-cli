import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getServiceConfig, findConfigFile } from '../config/loader.js';
import type { ServiceConfig } from '../config/types.js';

interface InstallOptions {
  configPath?: string;
}

/**
 * Generate .env file content from config env object
 */
function generateEnvContent(env: Record<string, string | number | boolean>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

/**
 * Execute shell command with logging
 */
function exec(cmd: string, options: { cwd?: string; silent?: boolean } = {}): void {
  if (!options.silent) {
    console.log(chalk.gray(`$ ${cmd}`));
  }
  try {
    execSync(cmd, { 
      cwd: options.cwd, 
      stdio: options.silent ? 'pipe' : 'inherit',
      env: { ...process.env }
    });
  } catch (error) {
    throw new Error(`Command failed: ${cmd}`);
  }
}

/**
 * Execute command as a specific user via sudo
 */
function execAsUser(cmd: string, user: string, options: { cwd?: string; env?: Record<string, string> } = {}): void {
  // Build environment exports
  const envExports = options.env 
    ? Object.entries(options.env).map(([k, v]) => `export ${k}="${v}"`).join('; ') + '; '
    : '';
  
  const fullCmd = `sudo -u ${user} bash -c '${envExports}${cmd.replace(/'/g, "'\\''")}'`;
  console.log(chalk.gray(`$ ${fullCmd}`));
  
  try {
    execSync(fullCmd, { 
      cwd: options.cwd, 
      stdio: 'inherit',
      env: { ...process.env }
    });
  } catch (error) {
    throw new Error(`Command failed: ${fullCmd}`);
  }
}

/**
 * Install command - runs on server after git push (called by post-receive hook)
 * 
 * Environment variables from hook:
 * - GPD_TARGET_DIR: Where to install (e.g., /opt/kairox/staging/kairox-api)
 * - GPD_GIT_DIR: Bare repo path (e.g., /git/sym/deploy-kairox/staging/kairox-api)
 * - GPD_SERVICE: Service name (e.g., kairox-api-staging)
 * - PM2_HOME: PM2 home directory (optional)
 * 
 * Steps:
 * 1. git checkout from bare repo to target dir (config file comes with this!)
 * 2. Load config from target dir
 * 3. Generate .env file from config
 * 4. npm install --omit=dev
 * 5. PM2 restart
 */
export async function installCommand(serviceName: string, options: InstallOptions = {}): Promise<void> {
  console.log(chalk.blue(`Installing ${serviceName}...`));

  // Get paths from environment (set by hook)
  const targetDir = process.env.GPD_TARGET_DIR;
  const gitDir = process.env.GPD_GIT_DIR;
  const pm2User = process.env.GPD_PM2_USER; // Optional, for pre-checkout user context
  
  if (!targetDir || !gitDir) {
    throw new Error('GPD_TARGET_DIR and GPD_GIT_DIR must be set. This command should be run by the post-receive hook.');
  }

  console.log(chalk.gray(`  Target: ${targetDir}`));
  console.log(chalk.gray(`  Git dir: ${gitDir}`));

  // 1. Git checkout FIRST - this brings .git-deploy.json to target dir
  console.log(chalk.blue('Checking out files...'));
  const checkoutCmd = `git --work-tree="${targetDir}" --git-dir="${gitDir}" checkout -f`;
  exec(checkoutCmd);

  // 2. NOW load config from target dir (file exists after checkout)
  const configPath = options.configPath || join(targetDir, '.git-deploy.json');
  if (!existsSync(configPath)) {
    throw new Error(`.git-deploy.json not found at ${configPath}. Make sure it's included in artifacts.`);
  }

  const config = getServiceConfig(serviceName, configPath);
  const { processName, pm2Home, pm2User: configPm2User, env } = config;
  const effectivePm2User = configPm2User || pm2User;

  if (effectivePm2User) console.log(chalk.gray(`  PM2 user: ${effectivePm2User}`));

  // Environment for npm/pm2 commands
  const cmdEnv: Record<string, string> = {};
  if (pm2Home) cmdEnv.PM2_HOME = pm2Home;
  if (effectivePm2User) {
    cmdEnv.HOME = `/opt/kairox`; // Use app directory as home for npm cache
  }

  // 2. Generate .env file from config
  // Note: When running via hook with sudo -u <user>, we're already that user
  // so files we create already have correct ownership
  if (env && Object.keys(env).length > 0) {
    console.log(chalk.blue('Generating .env file...'));
    const envPath = join(targetDir, '.env');
    const envContent = generateEnvContent(env);
    writeFileSync(envPath, envContent + '\n');
    console.log(chalk.gray(`  Written to ${envPath}`));
  }

  // 3. Create logs directory if needed
  // Note: We're running as the target user, so new dirs have correct ownership
  const logsDir = join(targetDir, 'logs');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
    console.log(chalk.gray(`  Created ${logsDir}`));
  }

  // 4. npm install
  // Note: When invoked via hook, we're already running as the correct user
  // Use explicit cache path to avoid permission issues
  // Scripts should check NODE_ENV and skip themselves in production
  console.log(chalk.blue('Installing dependencies...'));
  const npmCachePath = pm2Home ? `${pm2Home.replace('/.pm2', '')}/.npm` : undefined;
  const npmCmd = npmCachePath 
    ? `npm install --omit=dev --cache="${npmCachePath}"`
    : `npm install --omit=dev`;
  exec(npmCmd, { cwd: targetDir });

  // 5. Run post-deploy hooks (server-side, after npm install)
  if (config.hooks?.postDeploy && config.hooks.postDeploy.length > 0) {
    console.log(chalk.blue('Running post-deploy hooks...'));
    for (const hookCmd of config.hooks.postDeploy) {
      console.log(chalk.gray(`  $ ${hookCmd}`));
      try {
        exec(hookCmd, { cwd: targetDir });
      } catch (error) {
        console.log(chalk.red(`  ✗ Hook failed: ${hookCmd}`));
        // Continue with other hooks, but warn
      }
    }
  }

  // 6. Restart process manager
  const processManager = config.processManager || 'pm2';
  
  if (processManager === 'gpdd') {
    await restartWithGpdd(config, targetDir, cmdEnv);
  } else if (processManager === 'pm2') {
    await restartWithPm2(config, targetDir, cmdEnv);
  } else {
    console.log(chalk.yellow(`Unsupported process manager: ${processManager}`));
  }

  console.log(chalk.green(`✓ Installed ${serviceName}`));
}

/**
 * Restart service using PM2
 */
async function restartWithPm2(
  config: ServiceConfig, 
  targetDir: string, 
  cmdEnv: Record<string, string>
): Promise<void> {
  const { processName, pm2Home, pm2User } = config;
  
  // If GPD_PM2_USER is set, we're already running as that user (via sudo in hook)
  // No need to use execAsUser again
  const alreadyCorrectUser = process.env.GPD_PM2_USER === pm2User;
  
  console.log(chalk.blue('Restarting PM2 process...'));
  
  // Check if process exists and restart, otherwise start
  const pm2RestartCmd = `pm2 describe ${processName} > /dev/null 2>&1 && pm2 restart ${processName} --update-env || pm2 start ecosystem.config.cjs --env ${config.environment || 'production'}`;
  
  if (pm2User && !alreadyCorrectUser) {
    // Need to switch user
    execAsUser(pm2RestartCmd, pm2User, { cwd: targetDir, env: cmdEnv });
  } else {
    // Already correct user or no specific user needed
    let fullPm2Cmd = pm2RestartCmd;
    if (pm2Home) fullPm2Cmd = `PM2_HOME=${pm2Home} ${fullPm2Cmd}`;
    exec(fullPm2Cmd, { cwd: targetDir });
  }

  // PM2 save
  console.log(chalk.blue('Saving PM2 state...'));
  const pm2SaveCmd = 'pm2 save';
  if (pm2User && !alreadyCorrectUser) {
    execAsUser(pm2SaveCmd, pm2User, { env: cmdEnv });
  } else {
    let fullSaveCmd = pm2SaveCmd;
    if (pm2Home) fullSaveCmd = `PM2_HOME=${pm2Home} ${fullSaveCmd}`;
    exec(fullSaveCmd);
  }
  
  // Show status
  const pm2StatusCmd = 'pm2 status';
  if (pm2User && !alreadyCorrectUser) {
    execAsUser(pm2StatusCmd, pm2User, { env: cmdEnv });
  } else {
    let fullStatusCmd = pm2StatusCmd;
    if (pm2Home) fullStatusCmd = `PM2_HOME=${pm2Home} ${fullStatusCmd}`;
    exec(fullStatusCmd);
  }
}

/**
 * Restart service using GPDD (git-push-deploy-daemon)
 * Zero-downtime cluster restart
 */
async function restartWithGpdd(
  config: ServiceConfig,
  targetDir: string,
  cmdEnv: Record<string, string>
): Promise<void> {
  const entryPoint = config.gpddEntryPoint || 'dist/index.js';
  const workers = config.gpddWorkers || 0; // 0 = CPU count
  const pm2User = config.pm2User; // Reuse pm2User for gpdd as well
  
  // If GPD_PM2_USER is set, we're already running as that user
  const alreadyCorrectUser = process.env.GPD_PM2_USER === pm2User;
  
  console.log(chalk.blue('Managing GPDD process...'));
  
  // Check if gpdd is installed
  try {
    execSync('which gpdd', { stdio: 'pipe' });
  } catch {
    console.log(chalk.yellow('gpdd not found, installing...'));
    exec('npm install -g git-push-deploy-daemon');
  }
  
  // Check if already running
  const pidFile = join(targetDir, '.gpdd.pid');
  
  if (existsSync(pidFile)) {
    // Running - send reload signal for zero-downtime restart
    console.log(chalk.blue('Sending reload signal...'));
    const reloadCmd = `cd "${targetDir}" && gpdd reload`;
    if (pm2User && !alreadyCorrectUser) {
      execAsUser(reloadCmd, pm2User, { env: cmdEnv });
    } else {
      exec(reloadCmd);
    }
  } else {
    // Not running - start fresh
    console.log(chalk.blue(`Starting ${entryPoint} with ${workers || 'auto'} workers...`));
    const workerArg = workers > 0 ? `-w ${workers}` : '';
    const startCmd = `cd "${targetDir}" && gpdd start ${entryPoint} ${workerArg}`;
    if (pm2User && !alreadyCorrectUser) {
      // Start in background with nohup
      execAsUser(`nohup ${startCmd} > logs/gpdd.log 2>&1 &`, pm2User, { env: cmdEnv });
    } else {
      exec(`nohup ${startCmd} > logs/gpdd.log 2>&1 &`);
    }
    
    // Wait a moment for startup
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Show status
  console.log(chalk.blue('GPDD status:'));
  const statusCmd = `cd "${targetDir}" && gpdd status`;
  try {
    if (pm2User && !alreadyCorrectUser) {
      execAsUser(statusCmd, pm2User, { env: cmdEnv });
    } else {
      exec(statusCmd);
    }
  } catch {
    console.log(chalk.yellow('Could not get gpdd status (process may still be starting)'));
  }
}
