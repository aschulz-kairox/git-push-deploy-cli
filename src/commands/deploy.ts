import { stageCommand } from './stage.js';
import { releaseCommand } from './release.js';

interface DeployOptions {
  message?: string;
}

/**
 * Deploy command - stage and release in one step
 */
export async function deployCommand(serviceName: string, options: DeployOptions = {}): Promise<void> {
  await stageCommand(serviceName);
  await releaseCommand(serviceName, options);
}
