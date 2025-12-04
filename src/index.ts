#!/usr/bin/env node

import { Command } from 'commander';
import { stageCommand } from './commands/stage.js';
import { releaseCommand } from './commands/release.js';
import { deployCommand } from './commands/deploy.js';
import { initCommand } from './commands/init.js';
import { installCommand } from './commands/install.js';
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
  .description('Stage and release in one step')
  .option('-m, --message <message>', 'Commit message')
  .action(deployCommand);

// Server commands
program
  .command('init <service>')
  .description('Initialize bare repo, hook, and permissions on server')
  .option('--users <users>', 'Comma-separated list of users to add to group')
  .action(initCommand);

program
  .command('install <service>')
  .description('Extract, npm install, pm2 restart (used by post-receive hook)')
  .option('--ref <ref>', 'Git ref to deploy (branch or tag)', 'main')
  .action(installCommand);

program
  .command('status')
  .description('Show all services and PM2 status')
  .action(statusCommand);

program
  .command('logs <service>')
  .description('Show deployment logs')
  .option('-n, --lines <lines>', 'Number of lines to show', '50')
  .option('-f, --follow', 'Follow log output')
  .action(logsCommand);

program.parse();
