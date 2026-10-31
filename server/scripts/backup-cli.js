const path = require('path');
const dotenv = require('dotenv');
const db = require('../database/connection');
const { runMigrations } = require('../database/migrate');
const { createBackup, validateBackup, restoreBackup, listBackups } = require('../utils/backup');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const command = process.argv[2] || 'backup';
  const arg = process.argv[3];

  try {
    await runMigrations({ includeBootstrap: false });

    if (command === 'backup') {
      const meta = await createBackup({ label: arg || 'scheduled' });
      console.log('Backup created and verified successfully:');
      console.log(JSON.stringify(meta, null, 2));
    } else if (command === 'verify') {
      if (!arg) {
        const all = await listBackups();
        if (!all.length) throw new Error('No backups found to verify.');
        const res = await validateBackup(all[0].filename);
        console.log(JSON.stringify(res, null, 2));
        if (!res.valid) process.exitCode = 1;
      } else {
        const res = await validateBackup(arg);
        console.log(JSON.stringify(res, null, 2));
        if (!res.valid) process.exitCode = 1;
      }
    } else if (command === 'restore') {
      if (!arg) {
        throw new Error('Usage: npm run restore -- <backup-filename.sqlite>');
      }
      const res = await restoreBackup(arg);
      console.log('Database restored successfully:');
      console.log(JSON.stringify(res, null, 2));
    } else if (command === 'list') {
      const all = await listBackups();
      console.log(JSON.stringify(all, null, 2));
    } else {
      throw new Error(`Unknown command '${command}'. Supported: backup, verify, restore, list`);
    }
  } catch (error) {
    console.error('Backup CLI error:', error.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

main();
