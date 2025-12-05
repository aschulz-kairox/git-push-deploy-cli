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
    const { mainPackage, processName, pm2Home } = config;
    
    console.log(chalk.blue(`Installing on ${host}...`));
    
    const pm2Env = pm2Home ? `PM2_HOME=${pm2Home} ` : '';
    const remoteCmd = [
      `cd ${targetDir}`,
      'git pull --ff-only',
      `cd ${mainPackage}`,
      'npm install --omit=dev',
      `${pm2Env}pm2 restart ecosystem.config.cjs`
    ].join(' && ');
    
    sshExec(host, remoteCmd, { sshOptions });
    
    console.log(chalk.green(`✓ Deployed ${serviceName} to ${host}`));
  }
}
