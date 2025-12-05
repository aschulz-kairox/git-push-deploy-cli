import chalk from 'chalk';
import { getServiceConfig, getWorkspaceRoot } from '../config/loader.js';
import { runSshCommand } from '../utils/shell.js';

interface DaemonOptions {
  action: 'status' | 'reload' | 'stop' | 'start';
}

/**
 * Daemon command - control gpdd on remote server via SSH
 * 
 * gpd daemon <service> status   Show gpdd status
 * gpd daemon <service> reload   Zero-downtime reload
 * gpd daemon <service> stop     Stop the daemon
 * gpd daemon <service> start    Start the daemon
 */
export async function daemonCommand(serviceName: string, action: string): Promise<void> {
  const config = getServiceConfig(serviceName);
  const { host, sshOptions, targetDir } = config.server;
  
  if (config.processManager !== 'gpdd') {
    console.log(chalk.yellow(`Service ${serviceName} uses ${config.processManager || 'pm2'}, not gpdd`));
    console.log(chalk.gray(`Use 'gpd logs ${serviceName}' for PM2 services`));
    return;
  }
  
  console.log(chalk.blue(`GPDD ${action} for ${serviceName}...`));
  console.log(chalk.gray(`  Host: ${host}`));
  console.log(chalk.gray(`  Target: ${targetDir}`));
  console.log('');
  
  const runUser = config.pm2User;
  let cmd: string;
  
  switch (action) {
    case 'status':
      cmd = `cd "${targetDir}" && gpdd status`;
      break;
    case 'reload':
      cmd = `cd "${targetDir}" && gpdd reload`;
      break;
    case 'stop':
      cmd = `cd "${targetDir}" && gpdd stop`;
      break;
    case 'start':
      const entryPoint = config.gpddEntryPoint || 'dist/index.js';
      const workers = config.gpddWorkers ? `-w ${config.gpddWorkers}` : '';
      cmd = `cd "${targetDir}" && gpdd start ${entryPoint} ${workers}`;
      break;
    default:
      console.error(chalk.red(`Unknown action: ${action}`));
      console.log('Available actions: status, reload, stop, start');
      return;
  }
  
  // If running as different user, wrap in sudo
  if (runUser) {
    cmd = `sudo -u ${runUser} bash -c '${cmd.replace(/'/g, "'\\''")}'`;
  }
  
  try {
    const output = await runSshCommand(host, cmd, sshOptions);
    console.log(output);
    console.log(chalk.green(`✓ ${action} completed`));
  } catch (error: any) {
    console.error(chalk.red(`Failed: ${error.message}`));
    process.exit(1);
  }
}
