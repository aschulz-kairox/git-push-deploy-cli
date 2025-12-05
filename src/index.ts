#!/usr/bin/env node

import { Command } from 'commander';
import { stageCommand } from './commands/stage.js';
import { releaseCommand } from './commands/release.js';
import { deployCommand } from './commands/deploy.js';
import { initCommand } from './commands/init.js';
import { statusCommand } from './commands/status.js';
import { logsCommand } from './commands/logs.js';
import { installCommand } from './commands/install.js';

const program = new Command();

program
  .name('gpd')
  .description('Git Push Deploy - CLI for git-based deployments with PM2 support')
  .version('0.2.0');

// Development commands (run on dev machine)
program
  .command('stage <service>')
  .description('Copy build artifacts to deploy repository (creates repo if needed)')
  .action(stageCommand);

program
  .command('release <service>')
  .description('Commit and push deploy repository to server')
  .option('-m, --message <message>', 'Commit message')
  .action(releaseCommand);

program
  .command('deploy <service>')
  .description('Stage and push to server (hook handles install)')
  .option('-m, --message <message>', 'Commit message')
  .option('--skip-push', 'Only stage, do not push')
  .action((service, options) => deployCommand(service, { message: options.message, skipPush: options.skipPush }));

// Server setup command
program
  .command('init <service>')
  .description('Initialize bare repo, target dir, and post-receive hook on server')
  .action(initCommand);

// Server-side command (run by post-receive hook)
program
  .command('install <service>')
  .description('Install service on server (called by post-receive hook)')
  .option('-c, --config <path>', 'Path to .git-deploy.json')
  .action((service, options) => installCommand(service, { configPath: options.config }));

program
  .command('status')
  .description('Show all configured services')
  .action(statusCommand);

program
  .command('logs <service>')
  .description('Show PM2 logs from server via SSH')
  .option('-n, --lines <lines>', 'Number of lines to show', '50')
  .option('-f, --follow', 'Follow log output')
  .action(logsCommand);

program.parse();
