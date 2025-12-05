import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getServiceConfig, findConfigFile } from '../config/loader.js';

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
 * 1. git checkout from bare repo to target dir
 * 2. Generate .env file from config
 * 3. npm install --omit=dev
 * 4. PM2 restart
 */
export async function installCommand(serviceName: string, options: InstallOptions = {}): Promise<void> {
  console.log(chalk.blue(`Installing ${serviceName}...`));

  // Get paths from environment (set by hook) or use config
  const targetDir = process.env.GPD_TARGET_DIR;
  const gitDir = process.env.GPD_GIT_DIR;
  
  if (!targetDir || !gitDir) {
    throw new Error('GPD_TARGET_DIR and GPD_GIT_DIR must be set. This command should be run by the post-receive hook.');
  }

  // Find config - on server it should be at /etc/gpd/<service>.json or passed via -c
  const configPath = options.configPath || findConfigFile();
  if (!configPath) {
    throw new Error('.git-deploy.json not found. Specify with -c option.');
  }

  const config = getServiceConfig(serviceName, configPath);
  const { processName, pm2Home, pm2User, env } = config;

  console.log(chalk.gray(`  Target: ${targetDir}`));
  console.log(chalk.gray(`  Git dir: ${gitDir}`));
  if (pm2User) console.log(chalk.gray(`  PM2 user: ${pm2User}`));

  // Determine which user to run commands as
  const runUser = pm2User || process.env.USER || 'root';
  const userHome = pm2User ? `/home/${pm2User}` : process.env.HOME || '/root';
  
  // Environment for npm/pm2 commands
  const cmdEnv: Record<string, string> = {};
  if (pm2Home) cmdEnv.PM2_HOME = pm2Home;
  if (pm2User) {
    cmdEnv.HOME = `/opt/kairox`; // Use app directory as home for npm cache
  }

  // 1. Git checkout from bare repo to target dir
  console.log(chalk.blue('Checking out files...'));
  const checkoutCmd = `git --work-tree="${targetDir}" --git-dir="${gitDir}" checkout -f`;
  if (pm2User) {
    execAsUser(checkoutCmd, pm2User);
  } else {
    exec(checkoutCmd);
  }

  // 2. Generate .env file from config
  if (env && Object.keys(env).length > 0) {
    console.log(chalk.blue('Generating .env file...'));
    const envPath = join(targetDir, '.env');
    const envContent = generateEnvContent(env);
    writeFileSync(envPath, envContent + '\n');
    console.log(chalk.gray(`  Written to ${envPath}`));
    
    // Fix ownership if running as different user
    if (pm2User) {
      exec(`sudo chown ${pm2User}:${pm2User} "${envPath}"`, { silent: true });
    }
  }

  // 3. Create logs directory if needed
  const logsDir = join(targetDir, 'logs');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
    if (pm2User) {
      exec(`sudo chown ${pm2User}:${pm2User} "${logsDir}"`, { silent: true });
    }
    console.log(chalk.gray(`  Created ${logsDir}`));
  }

  // 4. npm install
  console.log(chalk.blue('Installing dependencies...'));
  const npmCmd = `npm install --omit=dev --cache=/opt/kairox/.npm`;
  if (pm2User) {
    execAsUser(npmCmd, pm2User, { cwd: targetDir, env: cmdEnv });
  } else {
    exec(npmCmd, { cwd: targetDir });
  }

  // 5. PM2 restart (or start if not running)
  console.log(chalk.blue('Restarting PM2 process...'));
  
  // Check if process exists and restart, otherwise start
  const pm2RestartCmd = `pm2 describe ${processName} > /dev/null 2>&1 && pm2 restart ${processName} --update-env || pm2 start ecosystem.config.cjs --env ${config.environment || 'production'}`;
  
  if (pm2User) {
    execAsUser(pm2RestartCmd, pm2User, { cwd: targetDir, env: cmdEnv });
  } else {
    let fullPm2Cmd = pm2RestartCmd;
    if (pm2Home) fullPm2Cmd = `PM2_HOME=${pm2Home} ${fullPm2Cmd}`;
    exec(fullPm2Cmd, { cwd: targetDir });
  }

  // 6. PM2 save
  console.log(chalk.blue('Saving PM2 state...'));
  const pm2SaveCmd = 'pm2 save';
  if (pm2User) {
    execAsUser(pm2SaveCmd, pm2User, { env: cmdEnv });
  } else {
    let fullSaveCmd = pm2SaveCmd;
    if (pm2Home) fullSaveCmd = `PM2_HOME=${pm2Home} ${fullSaveCmd}`;
    exec(fullSaveCmd);
  }

  console.log(chalk.green(`✓ Installed ${serviceName}`));
  
  // Show status
  const pm2StatusCmd = 'pm2 status';
  if (pm2User) {
    execAsUser(pm2StatusCmd, pm2User, { env: cmdEnv });
  } else {
    let fullStatusCmd = pm2StatusCmd;
    if (pm2Home) fullStatusCmd = `PM2_HOME=${pm2Home} ${fullStatusCmd}`;
    exec(fullStatusCmd);
  }
}
