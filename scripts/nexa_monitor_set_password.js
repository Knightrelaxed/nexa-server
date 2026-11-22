#!/usr/bin/env node
'use strict';
/**
 * ============================================================
 * N.E.X.A Pulse Monitor — Single-User Password Hash CLI
 *
 * Generates `NEXA_MONITOR_USER` and scrypt `NEXA_MONITOR_PASS_HASH`
 * lines ready to paste into `.env` (chmod 0600 on VPS).
 *
 * Usage:
 *   node scripts/nexa_monitor_set_password.js
 *   node scripts/nexa_monitor_set_password.js --user faqih
 * ============================================================
 */

const readline = require('readline');
process.env.DOTENV_CONFIG_QUIET = 'true';
const { hashPassword } = require('../src/monitor/auth_service');

const MIN_PASSWORD_LEN = 10;

function parseArgs(argv) {
  const args = { user: '' };
  for (let i = 2; i < argv.length; i++) {
    if ((argv[i] === '--user' || argv[i] === '-u') && argv[i + 1]) {
      args.user = String(argv[++i]).trim();
    }
  }
  return args;
}

function promptQuestion(rl, query) {
  return new Promise(resolve => rl.question(query, ans => resolve(String(ans || '').trim())));
}

function promptHidden(query) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    if (!stdin.isTTY) {
      const rl = readline.createInterface({ input: stdin, output: stdout });
      rl.question(query, ans => {
        rl.close();
        resolve(String(ans || ''));
      });
      return;
    }

    stdout.write(query);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write('\n');
        resolve(password);
      } else if (ch === '\u0003') {
        stdin.setRawMode(false);
        stdout.write('\n');
        reject(new Error('Cancelled by user'));
      } else if (ch === '\u007f' || ch === '\b') {
        if (password.length > 0) password = password.slice(0, -1);
      } else {
        password += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  let username = args.user;

  if (!username) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    username = await promptQuestion(rl, 'Monitor Username (e.g. admin): ');
    rl.close();
  }
  if (!username || username.length < 3 || /\s/.test(username)) {
    console.error('Error: Username must be at least 3 characters with no spaces.');
    process.exit(1);
  }

  const password = await promptHidden(`Password (min ${MIN_PASSWORD_LEN} chars): `);
  if (password.length < MIN_PASSWORD_LEN) {
    console.error(`Error: Password must be at least ${MIN_PASSWORD_LEN} characters.`);
    process.exit(1);
  }

  const confirm = await promptHidden('Confirm Password: ');
  if (password !== confirm) {
    console.error('Error: Passwords do not match.');
    process.exit(1);
  }

  const hash = hashPassword(password);
  console.log('\nAdd these lines to your .env file (keep chmod 0600 on VPS):\n');
  console.log(`NEXA_MONITOR_USER=${username}`);
  console.log(`NEXA_MONITOR_PASS_HASH=${hash}`);
  console.log('');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
