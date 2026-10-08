const path = require('node:path');
const readline = require('node:readline');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
};

const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || 3306);
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || '';
const database = process.env.DB_NAME || 'rashcuts';

function ask(question, hidden = false) {
  if (!hidden) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
  }
  return new Promise(resolve => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(question);
    stdin.setRawMode?.(true);
    stdin.resume();
    let answer = '';
    const onData = (chunk) => {
      const char = chunk.toString();
      if (char === '\u0003') { cleanup(); process.exit(130); }
      if (char === '\r' || char === '\n') { cleanup(); stdout.write('\n'); resolve(answer); return; }
      if (char === '\u007f') { answer = answer.slice(0, -1); return; }
      answer += char;
    };
    function cleanup() { stdin.setRawMode?.(false); stdin.pause(); stdin.removeListener('data', onData); }
    stdin.on('data', onData);
  });
}

(async () => {
  let connection;
  try {
    const email = (getArg('--email') || await ask('Admin email: ')).toLowerCase();
    const adminPassword = getArg('--password') || await ask('Admin password: ', true);
    if (!email || !email.includes('@')) throw new Error('Enter a valid email address.');
    if (adminPassword.length < 10) throw new Error('Use an admin password of at least 10 characters.');

    connection = await mysql.createConnection({ host, port, user, password, database });
    const hash = await bcrypt.hash(adminPassword, 12);
    await connection.execute(
      `INSERT INTO admin_users (email, password_hash) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), updated_at = CURRENT_TIMESTAMP`,
      [email, hash]
    );
    console.log(`Admin account ready: ${email}`);
  } catch (error) {
    console.error('Admin setup failed:', error.message);
    process.exitCode = 1;
  } finally {
    await connection?.end();
  }
})();
