// One command to get everything up.
//
// The three processes have always been a concurrently line; what was
// missing was the thing they all depend on. This settles Mongo first -
// uses the configured one if it answers, starts a throwaway one if it
// does not - and only then hands over to concurrently.
//
// The fallback is deliberately loud. A dev script that quietly swaps
// your database for an empty one is a script that has you debugging
// missing data instead of reading one line of output.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const configured = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/oction';
const forceLocal = process.env.FORCE_LOCAL_MONGO === '1';

// Never print the password back out at someone's terminal.
const redact = (uri) => uri.replace(/\/\/[^@/]+@/, '//***@');

// Atlas refuses an address that is not on its access list by killing the
// TLS handshake rather than the connection, so the useful part of the
// error is buried a couple of levels down.
function explain(err) {
  const servers = err?.reason?.servers;
  const first = servers ? [...servers.values()][0]?.error?.message : null;
  if (first && first.includes('tlsv1 alert internal error')) {
    return "TLS was refused - on Atlas this almost always means this machine's IP is not on the Network Access list";
  }
  if ((first && first.includes('bad auth')) || (err?.message ?? '').includes('bad auth')) {
    return 'the credentials were rejected';
  }
  return (err?.message ?? 'unknown error').split('\n')[0];
}

async function reachable(uri) {
  const connection = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 6000 });
  try {
    await connection.asPromise();
    await connection.close();
    return { ok: true };
  } catch (err) {
    await connection.close().catch(() => {});
    return { ok: false, why: explain(err) };
  }
}

function run(command, args, env) {
  return spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
}

function runToCompletion(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = run(command, args, env);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)),
    );
    child.on('error', reject);
  });
}

let memoryServer;

async function settleMongo() {
  if (!forceLocal) {
    process.stdout.write(`  mongo: ${redact(configured)}\n`);
    const result = await reachable(configured);
    if (result.ok) {
      console.log('  mongo: reachable\n');
      return { uri: configured, needsSeed: false };
    }
    console.log(`  mongo: UNREACHABLE - ${result.why}`);
    console.log('  mongo: falling back to a throwaway in-memory database\n');
  }

  const { MongoMemoryServer } = await import('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create({ instance: { dbName: 'oction' } });
  const uri = memoryServer.getUri('oction');
  console.log(`  mongo: in memory on port ${new URL(uri).port} - nothing is kept when you stop\n`);
  return { uri, needsSeed: true };
}

async function main() {
  console.log('\n  Oction\n');
  const { uri, needsSeed } = await settleMongo();

  if (needsSeed) {
    console.log('  seeding the catalogue\n');
    await runToCompletion('npm', ['run', '--silent', 'seed'], { MONGO_URI: uri });
  }

  const processes = run('npm', ['run', '--silent', 'dev:processes'], { MONGO_URI: uri });

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    processes.kill('SIGTERM');
    if (memoryServer) await memoryServer.stop().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  processes.on('exit', async (code) => {
    if (memoryServer) await memoryServer.stop().catch(() => {});
    process.exit(code ?? 0);
  });
}

main().catch(async (err) => {
  console.error(`\n  could not start: ${err.message}\n`);
  if (memoryServer) await memoryServer.stop().catch(() => {});
  process.exit(1);
});
