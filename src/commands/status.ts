import chalk from 'chalk';
import { loadConfig, listServices } from '../config/loader.js';
import { createProcessManager } from '../utils/process-manager.js';
import { commandExists } from '../utils/shell.js';

/**
 * Status command - show all services and process manager status
 */
export async function statusCommand(): Promise<void> {
  console.log(chalk.blue('Service Status'));
  console.log('');
  
  // List configured services
  try {
    const services = listServices();
    const config = loadConfig();
    
    console.log(chalk.white('Configured Services:'));
    for (const name of services) {
      const svc = config.services[name];
      const pmType = svc.processManager || 'pm2';
      console.log(chalk.gray(`  ${name}`));
      console.log(chalk.gray(`    Process Manager: ${pmType}`));
      console.log(chalk.gray(`    Process Name: ${svc.processName}`));
      console.log(chalk.gray(`    Packages: ${svc.packages.join(', ')}`));
      console.log(chalk.gray(`    Target: ${svc.server.targetDir}`));
    }
    console.log('');
  } catch {
    console.log(chalk.yellow('No .git-deploy.json found in current directory tree.'));
    console.log('');
  }
  
  // Show PM2 status if available
  if (commandExists('pm2')) {
    console.log(chalk.white('PM2 Processes:'));
    try {
      const pm2 = createProcessManager('pm2');
      const status = pm2.list();
      console.log(status);
    } catch {
      console.log(chalk.gray('  No PM2 processes running or PM2 not accessible.'));
    }
  }
  
  // Show systemd status if available
  if (commandExists('systemctl')) {
    console.log(chalk.white('Systemd Services (running):'));
    try {
      const systemd = createProcessManager('systemd');
      const status = systemd.list();
      // Filter to show only relevant lines
      const lines = status.split('\n').slice(0, 10);
      console.log(chalk.gray(lines.join('\n')));
      if (status.split('\n').length > 10) {
        console.log(chalk.gray('  ... (use systemctl for full list)'));
      }
    } catch {
      console.log(chalk.gray('  Could not query systemd.'));
    }
  }
}
