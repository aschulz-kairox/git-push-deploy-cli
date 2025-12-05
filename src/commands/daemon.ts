import chalk from 'chalk';
import { getServiceConfig, listServices, loadConfig } from '../config/loader.js';
import { getServers } from '../config/types.js';
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
 * 
 * Batch commands (all gpdd services):
 * gpd daemon all start          Start all gpdd services
 * gpd daemon all stop           Stop all gpdd services
 * gpd daemon all reload         Reload all gpdd services
 * gpd daemon all status         Show status of all gpdd services
 */
export async function daemonCommand(serviceName: string, action: string): Promise<void> {
  // Handle "all" service for batch operations
  if (serviceName === 'all') {
    await handleAllServices(action);
    return;
  }
  
  await handleSingleService(serviceName, action);
}

/**
 * Handle daemon command for all gpdd services
 */
async function handleAllServices(action: string): Promise<void> {
  const services = listServices();
  const gpddServices: string[] = [];
  
  // Filter to only gpdd services
  for (const name of services) {
    const config = getServiceConfig(name);
    if (config.processManager === 'gpdd') {
      gpddServices.push(name);
    }
  }
  
  if (gpddServices.length === 0) {
    console.log(chalk.yellow('No services configured with processManager: "gpdd"'));
    return;
  }
  
  console.log(chalk.bold(`Running ${action} on ${gpddServices.length} gpdd services...`));
  console.log(chalk.gray(`Services: ${gpddServices.join(', ')}`));
  console.log('');
  
  let success = 0;
  let failed = 0;
  
  for (const name of gpddServices) {
    console.log(chalk.blue(`━━━ ${name} ━━━`));
    try {
      await handleSingleService(name, action);
      success++;
    } catch (error: any) {
      console.error(chalk.red(`  Failed: ${error.message}`));
      failed++;
    }
    console.log('');
  }
  
  console.log(chalk.bold('Summary:'));
  console.log(`  ${chalk.green(`✓ ${success} succeeded`)}`);
  if (failed > 0) {
    console.log(`  ${chalk.red(`✗ ${failed} failed`)}`);
  }
}

/**
 * Handle daemon command for a single service
 */
async function handleSingleService(serviceName: string, action: string): Promise<void> {
  const config = getServiceConfig(serviceName);
  const servers = getServers(config);
  
  if (config.processManager !== 'gpdd') {
    console.log(chalk.yellow(`Service ${serviceName} uses ${config.processManager || 'pm2'}, not gpdd`));
    console.log(chalk.gray(`Use 'gpd logs ${serviceName}' for PM2 services`));
    return;
  }
  
  // Run on all servers
  for (const server of servers) {
    const { host, sshOptions, targetDir } = server;
    const serverLabel = server.name || host;
    
    console.log(chalk.blue(`GPDD ${action} on ${serverLabel}...`));
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
        const workers = config.gpddWorkers ? `-w ${config.gpddWorkers}` : '-w 1';
        const readyUrl = config.gpddReadyUrl ? `--ready-url ${config.gpddReadyUrl}` : '';
        // Always use -d (daemon mode) so SSH doesn't hang
        cmd = `cd "${targetDir}" && gpdd start ${entryPoint} ${workers} ${readyUrl} -d`;
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
      console.log(chalk.green(`✓ ${action} completed on ${serverLabel}`));
    } catch (error: any) {
      console.error(chalk.red(`Failed on ${serverLabel}: ${error.message}`));
    }
    
    if (servers.length > 1) console.log('');
  }
}
