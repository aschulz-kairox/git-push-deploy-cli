import chalk from 'chalk';
import { execSync } from 'child_process';
import { getServiceConfig, getWorkspaceRoot, getSourceDir, getDeployRepoPath } from '../config/loader.js';
import { DEFAULT_ARTIFACTS, parseSshPort, buildSshUrl } from '../config/types.js';
import { ensureDir, removeDir, copy, exists, joinPath } from '../utils/files.js';

/**
 * Initialize deploy repo if it doesn't exist (lazy init)
 * Creates git repo and adds remote pointing to server bare repo
 */
function initDeployRepoIfNeeded(
  deployRepoPath: string, 
  host: string, 
  bareRepo: string, 
  sshOptions?: string
): boolean {
  if (exists(joinPath(deployRepoPath, '.git'))) {
    return false; // Already initialized
  }

  console.log(chalk.blue('  Initializing deploy repository...'));
  ensureDir(deployRepoPath);
  
  // git init
  execSync('git init', { cwd: deployRepoPath, stdio: 'pipe' });
  
  // Add remote with SSH URL
  const port = parseSshPort(sshOptions);
  const sshUrl = buildSshUrl(host, bareRepo, port);
  execSync(`git remote add origin ${sshUrl}`, { cwd: deployRepoPath, stdio: 'pipe' });
  
  console.log(chalk.gray(`    Remote: ${sshUrl}`));
  return true;
}

/**
 * Stage command - copy build artifacts to deploy repository
 * 
 * New architecture:
 * - sourceDir: where the project is (e.g., kairox-api-node)
 * - deployRepo: relative to sourceDir (e.g., deploy/staging)
 * - artifacts: copied from sourceDir to deployRepo
 */
export async function stageCommand(serviceName: string): Promise<void> {
  console.log(chalk.blue(`Staging ${serviceName}...`));
  
  const config = getServiceConfig(serviceName);
  const workspaceRoot = getWorkspaceRoot();
  const sourceDir = getSourceDir(config, workspaceRoot);
  const deployRepoPath = getDeployRepoPath(config, workspaceRoot);
  const artifacts = config.artifacts || DEFAULT_ARTIFACTS;
  
  // Validate source directory exists
  if (!exists(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }
  
  console.log(chalk.gray(`  Source: ${config.sourceDir}`));
  console.log(chalk.gray(`  Deploy: ${config.sourceDir}/${config.deployRepo}`));
  
  // Lazy init deploy repo
  const { host, bareRepo, sshOptions } = config.server;
  const wasInitialized = initDeployRepoIfNeeded(deployRepoPath, host, bareRepo, sshOptions);
  if (wasInitialized) {
    console.log(chalk.green('  ✓ Deploy repo initialized'));
  }
  
  // Copy artifacts from sourceDir to deployRepo
  let copiedCount = 0;
  for (const artifact of artifacts) {
    const srcPath = joinPath(sourceDir, artifact);
    const destPath = joinPath(deployRepoPath, artifact);
    
    if (exists(srcPath)) {
      // Remove old artifact first (clean copy)
      removeDir(destPath);
      copy(srcPath, destPath);
      console.log(chalk.gray(`    ${artifact}`));
      copiedCount++;
    } else {
      console.log(chalk.yellow(`  Warning: ${artifact} not found in ${config.sourceDir}`));
    }
  }
  
  if (copiedCount === 0) {
    throw new Error('No artifacts were copied. Check your artifacts config and build output.');
  }
  
  console.log(chalk.green(`✓ Staged ${copiedCount} artifact(s) to ${config.sourceDir}/${config.deployRepo}`));
}
