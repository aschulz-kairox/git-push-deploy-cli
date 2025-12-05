import chalk from 'chalk';
import { getServiceConfig } from '../config/loader.js';
import { sshExec } from '../utils/shell.js';

interface InitOptions {
  // No options needed for now
}

/**
 * Init command - initialize bare repo and clone on remote server via SSH
 * 
 * Creates:
 * 1. Bare repo at server.bareRepo (e.g., /git/sym/deploy-kairox-api)
 * 2. Clone at server.targetDir (e.g., /opt/kairox/kairox-api)
 */
export async function initCommand(serviceName: string, _options: InitOptions = {}): Promise<void> {
  console.log(chalk.blue(`Initializing ${serviceName}...`));
  
  const config = getServiceConfig(serviceName);
  const { host, bareRepo, targetDir } = config.server;
  
  console.log(chalk.gray(`  Host: ${host}`));
  console.log(chalk.gray(`  Bare repo: ${bareRepo}`));
  console.log(chalk.gray(`  Target dir: ${targetDir}`));
  
  // 1. Create bare repo
  console.log(chalk.gray(`  Creating bare repo...`));
  const createBareCmd = `mkdir -p ${bareRepo} && cd ${bareRepo} && git init --bare`;
  sshExec(host, createBareCmd);
  
  // 2. Create target directory and clone
  console.log(chalk.gray(`  Creating clone at target...`));
  const parentDir = targetDir.split('/').slice(0, -1).join('/');
  const cloneName = targetDir.split('/').pop();
  const cloneCmd = `mkdir -p ${parentDir} && cd ${parentDir} && git clone ${bareRepo} ${cloneName} 2>/dev/null || (cd ${targetDir} && git pull)`;
  sshExec(host, cloneCmd);
  
  console.log(chalk.green(`✓ Initialized ${serviceName}`));
  console.log('');
  console.log(chalk.gray('Server setup complete. Now you can deploy:'));
  console.log(chalk.white(`  gpd deploy ${serviceName}`));
}
