import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { ensureDir, getRepoRoot, parseArgs, resolveD1DatabaseName } from './cloudflareScriptUtils';

function resolveInputDir(rawInput?: string): string {
  const repoRoot = getRepoRoot();
  const input = rawInput || '.wrangler/d1-import';
  const repoCandidate = path.isAbsolute(input) ? input : path.resolve(repoRoot, input);
  const cwdCandidate = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
  const baseDir = fs.existsSync(repoCandidate) ? repoCandidate : cwdCandidate;

  if (!fs.existsSync(baseDir)) {
    throw new Error(`Import directory not found: ${baseDir}`);
  }

  const manifestPath = path.join(baseDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    return baseDir;
  }

  const candidates = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(baseDir, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'manifest.json')))
    .sort();

  const latest = candidates.at(-1);
  if (!latest) {
    throw new Error(`No manifest.json found under ${baseDir}`);
  }

  return latest;
}

function listSqlFiles(inputDir: string): string[] {
  return fs.readdirSync(inputDir)
    .filter((file) => /^\d+\.sql$/.test(file))
    .sort()
    .map((file) => path.join(inputDir, file));
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = getRepoRoot();
  ensureDir(path.join(repoRoot, '.wrangler'));

  const mode = args.remote ? '--remote' : '--local';
  const dryRun = Boolean(args['dry-run']);
  const databaseName = resolveD1DatabaseName(args);
  const inputDir = resolveInputDir(typeof args.input === 'string' ? args.input : undefined);
  const files = listSqlFiles(inputDir);

  if (files.length === 0) {
    throw new Error(`No SQL chunk files found in ${inputDir}`);
  }

  for (const file of files) {
    const command = [
      'npx',
      'wrangler',
      'd1',
      'execute',
      databaseName,
      mode,
      '--file',
      file,
      '--config',
      path.join(repoRoot, 'wrangler.jsonc'),
    ];

    console.log(`${dryRun ? 'Would apply' : 'Applying'} ${path.basename(file)} to D1 database ${databaseName} (${mode.slice(2)})`);
    if (dryRun) {
      console.log(command.join(' '));
      continue;
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
      throw new Error(`Failed while applying ${file}`);
    }
  }

  console.log(`${dryRun ? 'Validated' : 'Applied'} ${files.length} SQL chunks from ${inputDir}`);
}

main();
