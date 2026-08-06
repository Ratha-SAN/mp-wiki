import { execFileSync } from 'node:child_process';

/**
 * Maps each note's vault-relative path to the ISO date of the commit that
 * first added it, using full git history (`git log --diff-filter=A`).
 *
 * Returns an empty map — never throws — if the build isn't running inside a
 * git repo, or history turns out to be shallow: "recently added" badges just
 * won't show, which is a cosmetic gap, not a build failure.
 */
export function loadCreationDates(repoRoot, vaultPath) {
  const dates = new Map();
  const prefix = `${vaultPath.replace(/\/+$/, '')}/`;

  let output;
  try {
    output = execFileSync(
      'git',
      ['log', '--diff-filter=A', '--name-status', '--format=\x01%aI', '--', vaultPath],
      { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
  } catch {
    return dates;
  }

  let currentDate = null;
  for (const line of output.split('\n')) {
    if (line.startsWith('\x01')) {
      currentDate = line.slice(1).trim();
      continue;
    }
    const match = /^A\s+(.+)$/.exec(line);
    if (!match || !currentDate || !match[1].startsWith(prefix)) continue;
    // git log runs newest-first; keep overwriting so the last (oldest) match sticks —
    // that's the commit that actually first introduced the file.
    dates.set(match[1].slice(prefix.length), currentDate);
  }
  return dates;
}
