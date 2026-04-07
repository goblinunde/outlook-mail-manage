import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeSqliteDatabaseAdapter } from '../nodeSqlite';

test('NodeSqliteDatabaseAdapter normalizes bigint insert ids to strings', async () => {
  const adapter = new NodeSqliteDatabaseAdapter({
    prepare(sql: string) {
      assert.equal(sql, 'INSERT INTO accounts(email) VALUES (?)');

      return {
        run(...params: unknown[]) {
          assert.deepEqual(params, ['alpha@outlook.com']);

          return {
            changes: 1,
            lastInsertRowid: 12n,
          };
        },
      };
    },
  } as any);

  const result = await adapter.run(
    'INSERT INTO accounts(email) VALUES (?)',
    ['alpha@outlook.com']
  );

  assert.equal(result.changes, 1);
  assert.equal(result.lastInsertRowid, '12');
});
