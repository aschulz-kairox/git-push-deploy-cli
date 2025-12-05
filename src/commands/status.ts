import chalk from 'chalk';
import { loadConfig, listServices } from '../config/loader.js';

/**
 * Status command - show all configured services
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
      console.log(chalk.gray(`  ${name}`));
      console.log(chalk.gray(`    Host: ${svc.server.host}`));
      console.log(chalk.gray(`    Process: ${svc.processName}`));
      console.log(chalk.gray(`    Source: ${svc.sourceDir}`));
      console.log(chalk.gray(`    Deploy: ${svc.sourceDir}/${svc.deployRepo}`));
      console.log(chalk.gray(`    Target: ${svc.server.targetDir}`));
      if (svc.environment) {
        console.log(chalk.gray(`    Environment: ${svc.environment}`));
      }
    }
    console.log('');
  } catch {
    console.log(chalk.yellow('No .git-deploy.json found in current directory tree.'));
    console.log('');
  }
}
