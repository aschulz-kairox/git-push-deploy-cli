import chalk from 'chalk';
import { stageCommand } from './stage.js';
import { releaseCommand } from './release.js';
import { getServiceConfig } from '../config/loader.js';
import { sshExec } from '../utils/shell.js';

interface DeployOptions {
  message?: string;
  skipRemote?: boolean;
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
 * Deploy command - stage, release, and trigger remote install
 */
export async function deployCommand(serviceName: string, options: DeployOptions = {}): Promise<void> {
  // 1. Stage artifacts
  await stageCommand(serviceName);

  // 2. Commit and push
  await releaseCommand(serviceName, options);

  // 3. Trigger remote install via SSH
  if (!options.skipRemote) {
    const config = getServiceConfig(serviceName);
    const { host, targetDir, sshOptions } = config.server;
    const { mainPackage, pm2Home, pm2User, processName, env } = config;

    console.log(chalk.blue(`Installing on ${host}...`));

    // Build remote commands
    const commands: string[] = [
      `cd ${targetDir}`,
      'git pull --ff-only',
      `cd ${mainPackage}`,
    ];

    // Generate .env file if env config exists
    if (env && Object.keys(env).length > 0) {
      const envContent = generateEnvContent(env);
      // Use heredoc to write .env file
      commands.push(`cat > .env << 'GPDENVEOF'
${envContent}
GPDENVEOF`);
    }

    // Install dependencies
    commands.push('npm install --omit=dev');

    // Build PM2 command with GPD_PROCESS_NAME for dynamic naming
    let pm2Cmd = `GPD_PROCESS_NAME=${processName} pm2 restart ecosystem.config.cjs 2>/dev/null || GPD_PROCESS_NAME=${processName} pm2 start ecosystem.config.cjs`;
    if (pm2Home) {
      pm2Cmd = `PM2_HOME=${pm2Home} ${pm2Cmd}`;
    }
    if (pm2User) {
      pm2Cmd = `sudo -u ${pm2User} bash -c '${pm2Cmd.replace(/'/g, "'\\''")}'`;
    }
    commands.push(pm2Cmd);

    const remoteCmd = commands.join(' && ');

    sshExec(host, remoteCmd, { sshOptions });

    console.log(chalk.green(` Deployed ${serviceName} to ${host}`));
  }
}
