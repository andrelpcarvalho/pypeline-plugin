import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  BASELINE_FILE,
  BRANCH,
  PROJECT_DIR,
  fileExists,
  readFileTrimmed,
  writeFile,
} from '../../config.js';
import { cleanFilename } from '../../fileUtils.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.cherry-rollback');

// ── Paths ─────────────────────────────────────────────────────────────────

const ROLLBACK_DIR    = (): string => path.join(PROJECT_DIR(), 'rollback_deploy');
const ROLLBACK_SOURCE = (): string => path.join(ROLLBACK_DIR(), 'force-app', 'main', 'default');

export type PypelineCherryRollbackResult = {
  gmudId: string;
  filesToDestroy: string[];
  filesToRestore: string[];
  rollbackDir: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────

function getTagCommit(tagName: string): string {
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

function getTagMessage(tagName: string): string {
  try {
    return execSync(`git tag -l --format="%(contents:subject)" ${tagName}`, {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function parseCommitCount(tagMessage: string): number {
  const match = /(\d+)/.exec(tagMessage);
  return match ? parseInt(match[1], 10) : 1;
}

function getGmudCommits(tagName: string): string[] {
  const tagCommit = getTagCommit(tagName);
  const count = parseCommitCount(getTagMessage(tagName));
  return execSync(`git log --format="%H" -${count} ${tagCommit}`, { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
}

function classifyGmudFiles(commits: string[]): Map<string, 'A' | 'M' | 'D'> {
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

function getFileAtCommit(filepath: string, commitHash: string): Buffer | null {
  try {
    return execSync(`git show ${commitHash}:${filepath}`, { encoding: 'buffer' });
  } catch {
    return null;
  }
}

function findPreGmudCommit(commits: string[]): string {
  const oldest = commits[commits.length - 1];
  return execSync(`git rev-parse ${oldest}~1`, { encoding: 'utf8' }).trim();
}

function ensureSfdxProject(dir: string): void {
  const sfdxPath = path.join(dir, 'sfdx-project.json');
  if (!fs.existsSync(sfdxPath)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(sfdxPath, JSON.stringify({
      packageDirectories: [{ path: 'force-app', default: true }],
      namespace: '',
      sfdcLoginUrl: 'https://login.salesforce.com',
      sourceApiVersion: '62.0',
    }, null, 2), 'utf8');
  }
}

// ── Command ───────────────────────────────────────────────────────────────

export default class PypelineCherryRollback extends SfCommand<PypelineCherryRollbackResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    gmud: Flags.string({
      char: 'g',
      summary: messages.getMessage('flags.gmud.summary'),
      required: true,
    }),
    'target-org': Flags.string({
      summary: messages.getMessage('flags.target-org.summary'),
      default: 'devops',
    }),
    wait: Flags.integer({
      char: 'w',
      summary: messages.getMessage('flags.wait.summary'),
      default: 240,
    }),
    'dry-run': Flags.boolean({
      summary: messages.getMessage('flags.dry-run.summary'),
      default: false,
    }),
  };

  public async run(): Promise<PypelineCherryRollbackResult> {
    const { flags } = await this.parse(PypelineCherryRollback);
    const gmudId = flags['gmud'];
    const dryRun = flags['dry-run'];
    const targetOrg = flags['target-org'] ?? 'devops';
    const waitMin = String(flags['wait'] ?? 240);
    const rollbackDir = ROLLBACK_DIR();

    this.log('');
    this.log('╔══════════════════════════════════════════════╗');
    this.log('║       PYPELINE CHERRY-ROLLBACK               ║');
    this.log('╚══════════════════════════════════════════════╝');
    this.log('');

    // ── Validate tag ──────────────────────────────────────────────────
    let tagCommit: string;
    try {
      tagCommit = getTagCommit(gmudId);
    } catch {
      this.error(`Tag '${gmudId}' não encontrada.`);
    }

    const commits = getGmudCommits(gmudId);
    const fileStatus = classifyGmudFiles(commits);
    const preGmudCommit = findPreGmudCommit(commits);

    this.log(`  GMUD      : ${gmudId}`);
    this.log(`  Commits   : ${commits.length}`);
    this.log(`  Pre-GMUD  : ${preGmudCommit.slice(0, 12)}...`);
    this.log('');

    const filesToDestroy: string[] = [];
    const filesToRestore: string[] = [];

    for (const [file, status] of fileStatus) {
      if (status === 'A') filesToDestroy.push(file);
      else if (status === 'M' || status === 'D') filesToRestore.push(file);
    }

    if (filesToDestroy.length > 0) {
      this.log('  DESTRUIR (adições):');
      for (const f of filesToDestroy) this.log(`    ✘ ${f}`);
      this.log('');
    }
    if (filesToRestore.length > 0) {
      this.log('  RESTAURAR (versão anterior):');
      for (const f of filesToRestore) this.log(`    ↩ ${f}`);
      this.log('');
    }

    if (filesToDestroy.length === 0 && filesToRestore.length === 0) {
      this.log('  Nenhuma alteração detectada.');
      return { gmudId, filesToDestroy, filesToRestore, rollbackDir };
    }

    if (dryRun) {
      this.log(`  Destruir: ${filesToDestroy.length}  Restaurar: ${filesToRestore.length}`);
      this.log('  [DRY-RUN]');
      return { gmudId, filesToDestroy, filesToRestore, rollbackDir };
    }

    const confirmed = await this.confirm({
      message: `Gerar rollback para ${gmudId}?`,
    });
    if (!confirmed) {
      this.log('[CANCELADO]');
      return { gmudId, filesToDestroy, filesToRestore, rollbackDir };
    }

    // ── Single folder: rollback_deploy/ ───────────────────────────────
    if (fs.existsSync(rollbackDir)) fs.rmSync(rollbackDir, { recursive: true, force: true });
    ensureSfdxProject(rollbackDir);
    fs.mkdirSync(ROLLBACK_SOURCE(), { recursive: true });

    // ── Restore modified files (pre-GMUD version) ─────────────────────
    if (filesToRestore.length > 0) {
      this.log('  Restaurando...');
      for (const file of filesToRestore) {
        const content = getFileAtCommit(file, preGmudCommit);
        if (!content) {
          this.warn(`    ✘ ${file}`);
          continue;
        }
        const cleaned = cleanFilename(file);
        const dst = path.join(rollbackDir, cleaned);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.writeFileSync(dst, content);

        if (cleaned.endsWith('.cls') || cleaned.endsWith('.trigger')) {
          const metaContent = getFileAtCommit(file + '-meta.xml', preGmudCommit);
          if (metaContent) fs.writeFileSync(dst + '-meta.xml', metaContent);
        }
        this.log(`    ✔ ${file}`);
      }
    }

    // ── Copy added files (so sf cli can generate destructiveChanges) ──
    if (filesToDestroy.length > 0) {
      this.log('  Preparando destructive...');
      for (const file of filesToDestroy) {
        const cleaned = cleanFilename(file);
        const src = path.join(PROJECT_DIR(), cleaned);
        const dst = path.join(rollbackDir, cleaned);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dst);
        } else {
          const content = getFileAtCommit(file, 'HEAD');
          if (content) fs.writeFileSync(dst, content);
        }
        if (cleaned.endsWith('.cls') || cleaned.endsWith('.trigger')) {
          const metaSrc = src + '-meta.xml';
          if (fs.existsSync(metaSrc)) fs.copyFileSync(metaSrc, dst + '-meta.xml');
        }
        this.log(`    ✘ ${file}`);
      }
    }

    // ── sf cli generates package.xml (all files in the folder) ────────
    this.log('');
    this.log('  Gerando package.xml...');
    spawnSync('sf', ['project', 'generate', 'manifest', '--source-dir', rollbackDir, '--output-dir', rollbackDir], {
      encoding: 'utf8', stdio: ['inherit', 'inherit', 'pipe'],
    });

    // ── Now separate: move destructive files OUT, generate destructiveChanges
    if (filesToDestroy.length > 0) {
      // Create a temp dir with only the files to destroy
      const tempDestructive = path.join(PROJECT_DIR(), '_temp_destructive');
      if (fs.existsSync(tempDestructive)) fs.rmSync(tempDestructive, { recursive: true, force: true });
      ensureSfdxProject(tempDestructive);

      for (const file of filesToDestroy) {
        const cleaned = cleanFilename(file);
        const src = path.join(rollbackDir, cleaned);
        const dst = path.join(tempDestructive, cleaned);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dst);
          // Also copy meta if exists
          if (fs.existsSync(src + '-meta.xml')) {
            fs.copyFileSync(src + '-meta.xml', dst + '-meta.xml');
          }
        }
      }

      // Generate destructiveChanges.xml from the temp folder
      this.log('  Gerando destructiveChanges.xml...');
      spawnSync('sf', [
        'project', 'generate', 'manifest',
        '--source-dir', tempDestructive,
        '--name', 'destructiveChanges',
        '--output-dir', rollbackDir,
      ], { encoding: 'utf8', stdio: ['inherit', 'inherit', 'pipe'] });

      // Remove the destructive files from rollback_deploy (they shouldn't be deployed, only destroyed)
      for (const file of filesToDestroy) {
        const cleaned = cleanFilename(file);
        const target = path.join(rollbackDir, cleaned);
        if (fs.existsSync(target)) fs.unlinkSync(target);
        if (fs.existsSync(target + '-meta.xml')) fs.unlinkSync(target + '-meta.xml');
      }

      // Regenerate package.xml WITHOUT the destructive files (only restore files remain)
      if (filesToRestore.length > 0) {
        this.log('  Regenerando package.xml (sem arquivos destrutivos)...');
        fs.unlinkSync(path.join(rollbackDir, 'package.xml'));
        spawnSync('sf', ['project', 'generate', 'manifest', '--source-dir', rollbackDir, '--output-dir', rollbackDir], {
          encoding: 'utf8', stdio: ['inherit', 'inherit', 'pipe'],
        });
      } else {
        // No files to restore — package.xml needs to be empty
        fs.writeFileSync(path.join(rollbackDir, 'package.xml'), [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<Package xmlns="http://soap.sforce.com/2006/04/metadata">',
          '  <version>62.0</version>',
          '</Package>',
        ].join('\n') + '\n', 'utf8');
      }

      // Cleanup temp
      fs.rmSync(tempDestructive, { recursive: true, force: true });
    }

    // ── Save metadata ─────────────────────────────────────────────────
    writeFile(
      path.join(PROJECT_DIR(), 'cherry_rollback.json'),
      JSON.stringify({ gmudId, preGmudCommit, tagCommit, filesToDestroy, filesToRestore, timestamp: new Date().toISOString() }, null, 2)
    );

    // ── Result ────────────────────────────────────────────────────────
    //
    // rollback_deploy/
    // ├── sfdx-project.json
    // ├── package.xml                ← only restore files
    // ├── destructiveChanges.xml     ← only files to destroy
    // └── force-app/main/default/    ← only restored (pre-GMUD) files
    //
    // One command does both:

    this.log('');
    this.log('╔══════════════════════════════════════════════════════════════╗');
    this.log(`║  ROLLBACK PRONTO: ${gmudId.padEnd(41)}║`);
    this.log('╠══════════════════════════════════════════════════════════════╣');
    this.log('║                                                            ║');
    this.log('║  sf project deploy start \\                                 ║');
    this.log('║    --manifest rollback_deploy/package.xml \\                ║');

    if (filesToDestroy.length > 0) {
      this.log('║    --post-destructive-changes \\                            ║');
      this.log('║      rollback_deploy/destructiveChanges.xml \\              ║');
    }

    this.log(`║    --target-org ${targetOrg} -w ${waitMin} --verbose \\`.padEnd(61) + '║');
    this.log('║    --test-level RunLocalTests                              ║');
    this.log('║                                                            ║');
    this.log('╚══════════════════════════════════════════════════════════════╝');
    this.log('');

    return { gmudId, filesToDestroy, filesToRestore, rollbackDir };
  }
}
