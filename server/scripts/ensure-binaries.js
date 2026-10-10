import { ensureBinaries } from '../src/utils/binaries.js';

console.log('[SyncCast Build] Running automated binary verification for environment...');
ensureBinaries()
  .then(() => {
    console.log('[SyncCast Build] Binary setup completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[SyncCast Build] Binary setup encountered an error:', err);
    // Do not fail build if network is unavailable during offline build; runtime will retry
    process.exit(0);
  });
