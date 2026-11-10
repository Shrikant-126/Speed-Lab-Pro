// Create a confirmed SpeedLab Pro account without sending an email
// (useful because the free Supabase mailer only sends ~2 auth emails per hour).
//
// Usage (from the repo root):   npm run create-user
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env. The password is typed
// in your terminal (hidden) and is never printed or stored.

import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.startsWith(question)) rl.output.write(question);
        else if (s.includes('\n') || s.includes('\r')) rl.output.write('\n');
        else rl.output.write('*');
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const email = (await ask('Email: ')).toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('That does not look like a valid email address.');
  process.exit(1);
}
const password = await ask('Password (min. 8 characters, hidden): ', { hidden: true });
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}
const again = await ask('Repeat password: ', { hidden: true });
if (again !== password) {
  console.error('Passwords do not match.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) {
  if (/already/i.test(error.message)) {
    // Existing (possibly unconfirmed) account: confirm it and set the new password.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
    if (!existing) {
      console.error(`Could not create account: ${error.message}`);
      process.exit(1);
    }
    const { error: upd } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (upd) {
      console.error(`Could not update account: ${upd.message}`);
      process.exit(1);
    }
    console.log(`Existing account ${email} confirmed and password updated. You can sign in now.`);
    process.exit(0);
  }
  console.error(`Could not create account: ${error.message}`);
  process.exit(1);
}
console.log(`Account created and confirmed: ${data.user.email}. Sign in at Settings → Account.`);
