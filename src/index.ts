#!/usr/bin/env node

import { Command } from 'commander';
import { stageCommand } from './commands/stage.js';
import { releaseCommand } from './commands/release.js';
import { deployCommand } from './commands/deploy.js';
import { initCommand } from './commands/init.js';
import { statusCommand } from './commands/status.js';
import { logsCommand } from './commands/logs.js';

const program = new Command();

program
  .name('gpd')
  .description('Git Push Deploy - CLI for git-based deployments with PM2/systemd support')
  .version('0.1.0');

// Development commands
program
  .command('stage <service>')
  .description('Copy build artifacts to deploy repository')
  .action(stageCommand);

program
  .command('release <service>')
  .description('Commit and push deploy repository')
  .option('-m, --message <message>', 'Commit message')
  .action(releaseCommand);

program
  .command('deploy <service>')
  .description('Stage, release, and install on server via SSH')
  .option('-m, --message <message>', 'Commit message')
  .option('--skip-remote', 'Skip remote install (only stage and release)')
  .action(deployCommand);

// Server setup command
program
  .command('init <service>')
  .description('Initialize bare repo and clone on server via SSH')
  .action(initCommand);

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
