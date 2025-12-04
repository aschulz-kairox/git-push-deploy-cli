import chalk from 'chalk';
import { readFileSync } from 'fs';
import { getServiceConfig } from '../config/loader.js';
import { exec } from '../utils/shell.js';
import { exists, joinPath } from '../utils/files.js';
import { createProcessManager } from '../utils/process-manager.js';

interface InstallOptions {
  ref?: string;
}

/**
 * Install command - extract, npm install, restart process
 * This is called by the post-receive hook
 */
export async function installCommand(serviceName: string, options: InstallOptions = {}): Promise<void> {
  const ref = options.ref || 'main';
  console.log(chalk.blue(`Installing ${serviceName} (ref: ${ref})...`));
  
  const config = getServiceConfig(serviceName);
  const { server, packages, mainPackage, processName, processManager: pmType = 'pm2', pm2Home } = config;
  
  // Create process manager instance
  const pm = createProcessManager(pmType);
  
  // Extract each package using git archive
  for (const pkg of packages) {
    console.log(chalk.gray(`  Extracting ${pkg}...`));

    try {
      exec(`git archive ${ref} ${pkg}/ | tar -x -C ${server.targetDir}/`, {
        cwd: server.bareRepo,
        silent: true
      });
    } catch {
      console.log(chalk.yellow(`  Warning: Could not extract ${pkg}`));
    }
  }
  
  // Set ownership
  if (server.user) {
    exec(`chown -R ${server.user}:${server.user} ${server.targetDir}`, { silent: true });
  }
  
  // Install dependencies
  const mainPkgPath = joinPath(server.targetDir, mainPackage);
  console.log(chalk.gray(`  Installing dependencies in ${mainPackage}...`));
  
  if (server.user) {
    exec(`sudo -u ${server.user} npm install --omit=dev`, { cwd: mainPkgPath });
  } else {
    exec('npm install --omit=dev', { cwd: mainPkgPath });
  }
  
  // Restart process
  console.log(chalk.gray(`  Restarting ${pm.name} process ${processName}...`));
  if (server.user) {
    pm.asUser(server.user, `restart ${processName}`, { home: pm2Home });
  } else {
    pm.restart(processName, { home: pm2Home });
  }
  
  // Get version from package.json
  try {
    const pkgJsonPath = joinPath(mainPkgPath, 'package.json');
    if (exists(pkgJsonPath)) {
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      console.log(chalk.green(`✓ Installed ${serviceName} v${pkgJson.version}`));
    } else {
      console.log(chalk.green(`✓ Installed ${serviceName}`));
    }
  } catch {
    console.log(chalk.green(`✓ Installed ${serviceName}`));
  }
}
