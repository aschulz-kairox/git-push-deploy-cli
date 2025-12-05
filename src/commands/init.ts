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
  const { host, bareRepo, targetDir, sshOptions, user, group } = config.server;
  
  console.log(chalk.gray(`  Host: ${host}`));
  console.log(chalk.gray(`  Bare repo: ${bareRepo}`));
  console.log(chalk.gray(`  Target dir: ${targetDir}`));
  if (group) console.log(chalk.gray(`  Group: ${group}`));
  if (user) console.log(chalk.gray(`  User: ${user}`));
  
  // 1. Create group if specified (requires sudo)
  if (group) {
    console.log(chalk.gray(`  Creating group ${group}...`));
    const createGroupCmd = `sudo groupadd -f ${group} && sudo usermod -aG ${group} $(whoami)`;
    sshExec(host, createGroupCmd, { sshOptions });
  }
  
  // 2. Create bare repo with shared group access
  console.log(chalk.gray(`  Creating bare repo...`));
  const parentDir = bareRepo.split('/').slice(0, -1).join('/');
  const bareRepoName = bareRepo.split('/').pop();
  let createBareCmd = `sudo mkdir -p ${parentDir} && cd ${parentDir}`;
  if (group) {
    createBareCmd += ` && sudo chgrp ${group} ${parentDir} && sudo chmod g+rwxs ${parentDir}`;
  }
  createBareCmd += ` && git init --bare --shared=group ${bareRepoName}`;
  if (group) {
    createBareCmd += ` && sudo chgrp -R ${group} ${bareRepoName}`;
  }
  sshExec(host, createBareCmd, { sshOptions });
  
  // 3. Create target directory and clone (only if not already a git repo)
  console.log(chalk.gray(`  Creating clone at target...`));
  const targetParent = targetDir.split('/').slice(0, -1).join('/');
  let cloneCmd = `sudo mkdir -p ${targetParent}`;
  if (group) {
    cloneCmd += ` && sudo chgrp ${group} ${targetParent} && sudo chmod g+rwxs ${targetParent}`;
  }
  cloneCmd += ` && if [ -d "${targetDir}/.git" ]; then echo "Already a git repo"; else sudo rm -rf "${targetDir}" && git clone ${bareRepo} ${targetDir}; fi`;
  if (group) {
    cloneCmd += ` && sudo chgrp -R ${group} ${targetDir} && sudo chmod -R g+rw ${targetDir}`;
  }
  sshExec(host, cloneCmd, { sshOptions });
  
  console.log(chalk.green(`✓ Initialized ${serviceName}`));
  console.log('');
  console.log(chalk.gray('Server setup complete. Now you can deploy:'));
  console.log(chalk.white(`  gpd deploy ${serviceName}`));
}
