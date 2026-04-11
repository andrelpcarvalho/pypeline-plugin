import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  BASELINE_FILE,
  BRANCH,
  BUILD_DIR,
  PROJECT_DIR,
  fileExists,
  readFileTrimmed,
  writeFile,
} from '../../config.js';
import { copyFile } from '../../fileUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.cherry');

// ── Types ─────────────────────────────────────────────────────────────────

type GmudCommit = { hash: string; subject: string };

export type GmudInfo = {
  id: string;
  tagName: string;
  tagCommit: string;
  date: string;
  author: string;
  commits: GmudCommit[];
  files: string[];
};

export type PypelineCherryResult = {
  mode: 'include' | 'exclude';
  gmudsFound: GmudInfo[];
  gmudsSelected: string[];
  gmudsExcluded: string[];
  filesIncluded: string[];
  filesExcluded: string[];
};

// ── Git helpers (exported for cherry-rollback) ────────────────────────────

export function getTagCommit(tagName: string): string {
  try {
    return execSync(`git rev-parse "${tagName}^{commit}"`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return execSync(`git rev-parse ${tagName}`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  }
}

export function getTagMessage(tagName: string): string {
  try {
    return execSync(`git tag -l --format="%(contents:subject)" ${tagName}`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export function parseCommitCount(tagMessage: string): number {
  const match = /(\d+)/.exec(tagMessage);
  return match ? parseInt(match[1], 10) : 1;
}

export function getGmudCommits(tagName: string): string[] {
  const tagCommit = getTagCommit(tagName);
  const count = parseCommitCount(getTagMessage(tagName));
  return execSync(`git log --format="%H" -${count} ${tagCommit}`, { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
}

export function classifyGmudFiles(commits: string[]): Map<string, 'A' | 'M' | 'D'> {
  const fileStatus = new Map<string, 'A' | 'M' | 'D'>();
  for (const hash of commits) {
    const output = execSync(`git diff-tree --no-commit-id --name-status -r ${hash}`, { encoding: 'utf8' }).trim();
    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      const [status, ...parts] = line.split('\t');
      const filepath = parts[parts.length - 1];
      if (!fileStatus.has(filepath)) {
        if (status.startsWith('A')) fileStatus.set(filepath, 'A');
        else if (status.startsWith('M')) fileStatus.set(filepath, 'M');
        else if (status.startsWith('D')) fileStatus.set(filepath, 'D');
      }
    }
  }
  return fileStatus;
}

export function getFileAtCommit(filepath: string, commitHash: string): Buffer | null {
  try {
    return execSync(`git show ${commitHash}:${filepath}`, { encoding: 'buffer' });
  } catch {
    return null;
  }
}

export function findPreGmudCommit(commits: string[]): string {
  const oldest = commits[commits.length - 1];
  return execSync(`git rev-parse ${oldest}~1`, { encoding: 'utf8' }).trim();
}

// ── GMUD detection ───────────────────────────────────────────────────────

function detectGmuds(baselineHash: string, prefix: string): GmudInfo[] {
  const allTags = execSync('git tag --list --sort=creatordate', { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);

  const prefixUpper = prefix.toUpperCase();
  const gmudTags = allTags.filter((tag) => tag.toUpperCase().startsWith(prefixUpper));
  if (gmudTags.length === 0) return [];

  const allCommitsInRange = new Set(
    execSync(`git rev-list ${baselineHash}..HEAD`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  );

  return gmudTags
    .map((tagName) => buildGmudInfo(tagName, prefix, allCommitsInRange))
    .filter((g): g is GmudInfo => g !== null);
}

function buildGmudInfo(tagName: string, prefix: string, rangeCommits: Set<string>): GmudInfo | null {
  const tagCommit = getTagCommit(tagName);
  if (!rangeCommits.has(tagCommit)) return null;

  const count = parseCommitCount(getTagMessage(tagName));
  const commitsRaw = execSync(`git log --format="%H|%s" -${count} ${tagCommit}`, { encoding: 'utf8' }).trim();
  const commits: GmudCommit[] = commitsRaw.split('\n').filter(Boolean).map((line) => {
    const [hash, ...rest] = line.split('|');
    return { hash, subject: rest.join('|') };
  });

  const filesSet = new Set<string>();
  for (const commit of commits) {
    const raw = execSync(`git diff-tree --no-commit-id --name-only -r ${commit.hash}`, { encoding: 'utf8' }).trim();
    for (const f of raw.split('\n').filter(Boolean)) filesSet.add(f);
  }

  const info = execSync(`git log -1 --format="%ai|%an" ${tagCommit}`, { encoding: 'utf8' }).trim();
  const [date, author] = info.split('|');
  const gmudMatch = new RegExp(`${prefix}[_-]?\\w+`, 'i').exec(tagName);

  return {
    id: gmudMatch?.[0] ?? tagName,
    tagName,
    tagCommit,
    date: (date ?? '').slice(0, 10),
    author: author ?? 'unknown',
    commits,
    files: [...filesSet],
  };
}

// ── Selection logic ──────────────────────────────────────────────────────

type SelectionResult = {
  mode: 'include' | 'exclude';
  selected: GmudInfo[];
  excluded: GmudInfo[];
};

function selectGmuds(gmuds: GmudInfo[], excludeIds: string[], includeIds: string[]): SelectionResult {
  if (excludeIds.length > 0) {
    const set = new Set(excludeIds.map((id) => id.toUpperCase()));
    return {
      mode: 'exclude',
      selected: gmuds.filter((g) => !set.has(g.id.toUpperCase())),
      excluded: gmuds.filter((g) => set.has(g.id.toUpperCase())),
    };
  }
  if (includeIds.length > 0) {
    const set = new Set(includeIds.map((id) => id.toUpperCase()));
    return {
      mode: 'include',
      selected: gmuds.filter((g) => set.has(g.id.toUpperCase())),
      excluded: gmuds.filter((g) => !set.has(g.id.toUpperCase())),
    };
  }
  return { mode: 'include', selected: gmuds, excluded: [] };
}

function resolveFiles(selected: GmudInfo[], excluded: GmudInfo[]): { included: string[]; excluded: string[] } {
  const filesIncluded = [...new Set(selected.flatMap((g) => g.files))];
  const filesExcluded = [...new Set(excluded.flatMap((g) => g.files))];
  const finalExcluded = filesExcluded.filter((f) => !filesIncluded.includes(f));
  return { included: filesIncluded, excluded: finalExcluded };
}

// ── Build logic ──────────────────────────────────────────────────────────

function executeBuild(filesIncluded: string[], buildDir: string, log: (msg: string) => void, warn: (msg: string) => void): void {
  if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir, { recursive: true });

  log('  Copiando arquivos para build...');
  for (const file of filesIncluded) {
    try {
      copyFile(file, buildDir);
      log(`    ✔ ${file}`);
    } catch (err) {
      warn(`    ✘ ${file}: ${(err as Error).message}`);
    }
  }
}

// ── Command ──────────────────────────────────────────────────────────────

export default class PypelineCherry extends SfCommand<PypelineCherryResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    exclude: Flags.string({ char: 'x', summary: messages.getMessage('flags.exclude.summary'), multiple: true }),
    include: Flags.string({ char: 'i', summary: messages.getMessage('flags.include.summary'), multiple: true }),
    list: Flags.boolean({ char: 'l', summary: messages.getMessage('flags.list.summary'), default: false }),
    prefix: Flags.string({ summary: messages.getMessage('flags.prefix.summary'), default: 'GMUD' }),
    branch: Flags.string({ char: 'b', summary: messages.getMessage('flags.branch.summary'), default: BRANCH }),
    'dry-run': Flags.boolean({ summary: messages.getMessage('flags.dry-run.summary'), default: false }),
  };

  public async run(): Promise<PypelineCherryResult> {
    const { flags } = await this.parse(PypelineCherry);

    if (!fileExists(BASELINE_FILE())) this.error('baseline.txt não encontrado.');

    const baseline = readFileTrimmed(BASELINE_FILE());
    const prefix = flags['prefix'] ?? 'GMUD';
    const gmuds = detectGmuds(baseline, prefix);

    this.log('');
    this.log(`  Baseline: ${baseline.slice(0, 12)}...  Prefixo: ${prefix}*  GMUDs: ${gmuds.length}`);
    this.log('');

    if (gmuds.length === 0) {
      this.log(`  Nenhuma tag ${prefix}* encontrada entre baseline e HEAD.`);
      this.log('  Criar: git tag -a GMUD12345 -m "3" && git push origin GMUD12345');
      return { mode: 'include', gmudsFound: [], gmudsSelected: [], gmudsExcluded: [], filesIncluded: [], filesExcluded: [] };
    }

    for (const g of gmuds) {
      this.log(`  ${g.id} | ${g.commits.length} commits | ${g.files.length} files | ${g.date} | ${g.author}`);
    }
    this.log('');

    if (flags['list']) {
      return { mode: 'include', gmudsFound: gmuds, gmudsSelected: gmuds.map((g) => g.id), gmudsExcluded: [], filesIncluded: gmuds.flatMap((g) => g.files), filesExcluded: [] };
    }

    const excludeIds = flags['exclude'] ?? [];
    const includeIds = flags['include'] ?? [];
    if (excludeIds.length > 0 && includeIds.length > 0) this.error('Use --exclude OU --include.');

    const selection = selectGmuds(gmuds, excludeIds, includeIds);
    const files = resolveFiles(selection.selected, selection.excluded);

    this.log(`  Incluídas: ${selection.selected.map((g) => g.id).join(', ') || '(nenhuma)'}`);
    this.log(`  Excluídas: ${selection.excluded.map((g) => g.id).join(', ') || '(nenhuma)'}`);
    this.log(`  Arquivos: ${files.included.length} in / ${files.excluded.length} out`);
    this.log('');

    if (!flags['dry-run'] && files.included.length > 0) {
      const confirmed = await this.confirm({ message: `Gerar build com ${files.included.length} arquivo(s)?` });
      if (!confirmed) {
        this.log('[CANCELADO]');
        return { mode: selection.mode, gmudsFound: gmuds, gmudsSelected: selection.selected.map((g) => g.id), gmudsExcluded: selection.excluded.map((g) => g.id), filesIncluded: files.included, filesExcluded: files.excluded };
      }

      executeBuild(files.included, BUILD_DIR(), (m) => this.log(m), (m) => this.warn(m));

      writeFile(path.join(PROJECT_DIR(), 'cherry_gmuds.json'), JSON.stringify({
        mode: selection.mode,
        selected: selection.selected.map((g) => ({ id: g.id, tag: g.tagName, commit: g.tagCommit })),
        excluded: selection.excluded.map((g) => ({ id: g.id, tag: g.tagName, commit: g.tagCommit })),
        timestamp: new Date().toISOString(),
      }, null, 2));

      this.log('');
      this.log('  Build concluído. Execute: sf pypeline package → validate-prd → quickdeploy');
    }

    return { mode: selection.mode, gmudsFound: gmuds, gmudsSelected: selection.selected.map((g) => g.id), gmudsExcluded: selection.excluded.map((g) => g.id), filesIncluded: files.included, filesExcluded: files.excluded };
  }
}
