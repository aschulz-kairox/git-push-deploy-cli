import chalk from 'chalk';
import { loadConfig, listServices } from '../config/loader.js';
import { getServers } from '../config/types.js';

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
      const servers = getServers(svc);
      console.log(chalk.gray(`  ${name}`));
      if (servers.length === 1) {
        console.log(chalk.gray(`    Host: ${servers[0].host}`));
      } else {
        console.log(chalk.gray(`    Servers: ${servers.length}`));
        for (const server of servers) {
          const label = server.name || server.host;
          console.log(chalk.gray(`      - ${label}`));
        }
      }
      console.log(chalk.gray(`    Process: ${svc.processName}`));
      console.log(chalk.gray(`    Source: ${svc.sourceDir}`));
      console.log(chalk.gray(`    Deploy: ${svc.sourceDir}/${svc.deployRepo}`));
      if (servers.length === 1) {
        console.log(chalk.gray(`    Target: ${servers[0].targetDir}`));
      }
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
