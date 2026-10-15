import test from 'node:test';
import assert from 'node:assert/strict';
import { awaitKeylessTerrain } from './mapStackController.js';

test('keyless terrain request rejects on timeout so startup can use its fallback', async () => {
  const pending = new Promise(() => {});
  await assert.rejects(awaitKeylessTerrain(pending, 10), /terrain request timed out/);
});

test('keyless terrain request clears its timeout when the provider resolves', async () => {
  const provider = { name: 'terrain' };
  assert.equal(await awaitKeylessTerrain(Promise.resolve(provider), 100), provider);
});
