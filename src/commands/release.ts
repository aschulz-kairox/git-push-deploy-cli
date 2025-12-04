import chalk from 'chalk';
import { getServiceConfig, getWorkspaceRoot } from '../config/loader.js';
import { gitAddAll, gitCommit, gitPush, hasChanges, getCurrentBranch } from '../utils/git.js';
import { joinPath } from '../utils/files.js';

interface ReleaseOptions {
  message?: string;
}

/**
 * Release command - commit and push deploy repository
 */
export async function releaseCommand(serviceName: string, options: ReleaseOptions = {}): Promise<void> {
  console.log(chalk.blue(`Releasing ${serviceName}...`));
  
  const config = getServiceConfig(serviceName);
  const workspaceRoot = getWorkspaceRoot();
  const deployRepoPath = joinPath(workspaceRoot, config.deployRepo);
  
  // Check for changes
  if (!hasChanges(deployRepoPath)) {
    console.log(chalk.yellow('No changes to release.'));
    return;
  }
  
  // Commit
  const message = options.message || `deploy: ${serviceName}`;
  gitAddAll(deployRepoPath);
  
  const committed = gitCommit(deployRepoPath, message);
  if (!committed) {
    console.log(chalk.yellow('No changes to commit.'));
    return;
  }
  
  // Push
  const branch = getCurrentBranch(deployRepoPath);
  console.log(chalk.gray(`  Pushing to origin/${branch}...`));
  gitPush(deployRepoPath, 'origin', branch);
  
  console.log(chalk.green(`✓ Released ${serviceName}`));
}
