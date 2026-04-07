import path from 'path';
import { spawnSync } from 'child_process';
import { ensureDir, formatTimestamp, getRepoRoot, parseArgs, resolveD1DatabaseName, resolveOutputPath } from './cloudflareScriptUtils';

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = getRepoRoot();
  const databaseName = resolveD1DatabaseName(args);
  const mode = args.remote ? '--remote' : '--local';
  const dryRun = Boolean(args['dry-run']);
  const outputPath = resolveOutputPath(
    repoRoot,
    typeof args.output === 'string'
      ? args.output
      : `.wrangler/d1-export/${databaseName}-${mode.slice(2)}-${formatTimestamp()}.sql`
  );

  ensureDir(path.dirname(outputPath));

  const command = [
    'npx',
    'wrangler',
    'd1',
    'export',
    databaseName,
    mode,
    '--output',
    outputPath,
    '--config',
    path.join(repoRoot, 'wrangler.jsonc'),
  ];

  if (dryRun) {
    console.log(command.join(' '));
    console.log(`Would export D1 database ${databaseName} to ${outputPath}`);
    return;
  }

  const result = spawnSync(
    command[0],
    command.slice(1),
    {
      cwd: repoRoot,
      stdio: 'inherit',
    }
  );

  if (result.status !== 0) {
    throw new Error(`Failed to export D1 database ${databaseName}`);
  }

  console.log(`Exported D1 database ${databaseName} to ${outputPath}`);
}

main();
