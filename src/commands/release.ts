import chalk from 'chalk';
import { getServiceConfig, getWorkspaceRoot, getDeployRepoPath } from '../config/loader.js';
import { gitAddAll, gitCommit, gitPush, hasChanges, getCurrentBranch } from '../utils/git.js';

interface ReleaseOptions {
  message?: string;
}

/**
 * Release command - commit and push deploy repository
 * 
 * Pushes to the bare repo on the server, which triggers the post-receive hook.
 */
export async function releaseCommand(serviceName: string, options: ReleaseOptions = {}): Promise<void> {
  console.log(chalk.blue(`Releasing ${serviceName}...`));
  
  const config = getServiceConfig(serviceName);
  const workspaceRoot = getWorkspaceRoot();
  const deployRepoPath = getDeployRepoPath(config, workspaceRoot);
  
  // Check for changes
  if (!hasChanges(deployRepoPath)) {
    console.log(chalk.yellow('No changes to release.'));
    return;
  }
  
  // Commit
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const message = options.message || `deploy: ${serviceName} @ ${timestamp}`;
  gitAddAll(deployRepoPath);
  
  const committed = gitCommit(deployRepoPath, message);
  if (!committed) {
    console.log(chalk.yellow('No changes to commit.'));
    return;
  }
  
  // Push (this triggers the post-receive hook on the server)
  const branch = getCurrentBranch(deployRepoPath);
  console.log(chalk.gray(`  Pushing to origin/${branch}...`));
  gitPush(deployRepoPath, 'origin', branch);
  
  console.log(chalk.green(`✓ Released ${serviceName}`));
}
