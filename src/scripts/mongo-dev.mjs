// A MongoDB for people without Docker running.
//
// mongodb-memory-server is already a test dependency and has the binary
// cached, so this starts one on 27017 and holds it open until you stop
// it. Data lives in memory - fine for a demo, wrong for anything you
// want to still be there tomorrow. For that, use docker-compose.

import { MongoMemoryServer } from 'mongodb-memory-server';

const port = Number(process.env.MONGO_DEV_PORT ?? 27017);
const mongod = await MongoMemoryServer.create({
  instance: { port, dbName: 'oction' },
});

console.log(`mongo (in memory) listening on ${mongod.getUri()}`);
console.log('ctrl-c to stop. data is not persisted.');
console.log('');
console.log('  in a second terminal:');
console.log('    npm run seed:offline     (once, to fill the catalogue)');
console.log('    npm run dev:offline');
console.log('');

const stop = async () => {
  await mongod.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
