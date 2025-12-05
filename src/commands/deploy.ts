import chalk from 'chalk';
import { stageCommand, stageCommandDryRun } from './stage.js';
import { releaseCommand, releaseCommandDryRun } from './release.js';
import { getServiceConfig } from '../config/loader.js';

interface DeployOptions {
  message?: string;
  skipPush?: boolean;
  dryRun?: boolean;
}

/**
 * Deploy command - stage artifacts and push to server
 * 
 * New architecture:
 * 1. Stage: Copy build artifacts to deploy repo (with lazy init)
 * 2. Release: Commit and push to bare repo on server
 * 3. Server hook handles: git checkout, npm install, pm2 restart
 * 
 * No more SSH install from client - the post-receive hook does everything!
 */
export async function deployCommand(serviceName: string, options: DeployOptions = {}): Promise<void> {
  const config = getServiceConfig(serviceName);
  
  if (options.dryRun) {
    console.log(chalk.blue.bold(`[DRY RUN] Deploy preview for ${serviceName}`));
  } else {
    console.log(chalk.blue.bold(`Deploying ${serviceName}...`));
  }
  console.log(chalk.gray(`  Environment: ${config.environment || 'production'}`));
  console.log(chalk.gray(`  Server: ${config.server.host}`));
  console.log('');

  if (options.dryRun) {
    // Dry run - just show what would happen
    await stageCommandDryRun(serviceName);
    console.log('');
    await releaseCommandDryRun(serviceName);
    console.log('');
    console.log(chalk.yellow.bold('This was a dry run. No changes were made.'));
    console.log(chalk.gray('Run without --dry-run to actually deploy.'));
    return;
  }

  // 1. Stage artifacts to deploy repo
  await stageCommand(serviceName);
  console.log('');

  // 2. Commit and push (triggers server-side hook)
  if (!options.skipPush) {
    await releaseCommand(serviceName, options);
    console.log('');
    console.log(chalk.green.bold(`✓ Deployed ${serviceName}`));
    console.log(chalk.gray('  The server hook will handle: git checkout, npm install, pm2 restart'));
    console.log(chalk.gray(`  Check logs: gpd logs ${serviceName}`));
  } else {
    console.log(chalk.yellow('Skipped push (--skip-push). Run manually:'));
    console.log(chalk.white(`  gpd release ${serviceName}`));
  }
}
