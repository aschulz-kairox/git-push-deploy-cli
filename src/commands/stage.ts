import chalk from 'chalk';
import { getServiceConfig, getWorkspaceRoot } from '../config/loader.js';
import { DEFAULT_ARTIFACTS } from '../config/types.js';
import { ensureDir, removeDir, copy, exists, joinPath } from '../utils/files.js';

/**
 * Stage command - copy build artifacts to deploy repository
 */
export async function stageCommand(serviceName: string): Promise<void> {
  console.log(chalk.blue(`Staging ${serviceName}...`));
  
  const config = getServiceConfig(serviceName);
  const workspaceRoot = getWorkspaceRoot();
  const deployRepoPath = joinPath(workspaceRoot, config.deployRepo);
  const artifacts = config.artifacts || DEFAULT_ARTIFACTS;
  
  // Stage each package
  for (const pkg of config.packages) {
    const pkgPath = joinPath(workspaceRoot, pkg);
    const destPath = joinPath(deployRepoPath, pkg);
    
    if (!exists(pkgPath)) {
      console.log(chalk.yellow(`  Warning: Package ${pkg} not found at ${pkgPath}`));
      continue;
    }
    
    // Remove old staged files
    removeDir(destPath);
    ensureDir(destPath);
    
    // Copy artifacts
    for (const artifact of artifacts) {
      const srcArtifact = joinPath(pkgPath, artifact);
      const destArtifact = joinPath(destPath, artifact);
      
      if (exists(srcArtifact)) {
        copy(srcArtifact, destArtifact);
        console.log(chalk.gray(`  ${pkg}/${artifact}`));
      }
    }
  }
  
  console.log(chalk.green(`✓ Staged ${config.packages.length} package(s) to ${config.deployRepo}`));
}
