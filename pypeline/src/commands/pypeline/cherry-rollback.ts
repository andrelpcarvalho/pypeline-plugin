import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { PROJECT_DIR, writeFile } from '../../config.js';
import { cleanFilename } from '../../fileUtils.js';
import {
  getTagCommit,
  getGmudCommits,
  classifyGmudFiles,
  findPreGmudCommit,
  getFileAtCommit,
} from './cherry.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.cherry-rollback');

const ROLLBACK_DIR    = (): string => path.join(PROJECT_DIR(), 'rollback_deploy');
const ROLLBACK_SOURCE = (): string => path.join(ROLLBACK_DIR(), 'force-app', 'main', 'default');

export type PypelineCherryRollbackResult = {
  gmudId: string;
  filesToDestroy: string[];
  filesToRestore: string[];
  rollbackDir: string;
};

// ── Standalone functions ──────────────────────────────────────────────────

function splitFilesByAction(fileStatus: Map<string, 'A' | 'M' | 'D'>): { destroy: string[]; restore: string[] } {
  const destroy: string[] = [];
  const restore: string[] = [];
  for (const [file, status] of fileStatus) {
    if (status === 'A') destroy.push(file);
    else restore.push(file);
  }
  return { destroy, restore };
}

function ensureSfdxProject(dir: string): void {
  const sfdxPath = path.join(dir, 'sfdx-project.json');
  if (fs.existsSync(sfdxPath)) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(sfdxPath, JSON.stringify({
    packageDirectories: [{ path: 'force-app', default: true }],
    namespace: '',
    sfdcLoginUrl: 'https://login.salesforce.com',
    sourceApiVersion: '62.0',
  }, null, 2), 'utf8');
}

function prepareRollbackDir(rollbackDir: string): void {
  if (fs.existsSync(rollbackDir)) fs.rmSync(rollbackDir, { recursive: true, force: true });
  ensureSfdxProject(rollbackDir);
  fs.mkdirSync(ROLLBACK_SOURCE(), { recursive: true });
}

function restoreFiles(files: string[], preGmudCommit: string, rollbackDir: string, log: (m: string) => void, warn: (m: string) => void): void {
  log('  Restaurando...');
  for (const file of files) {
    const content = getFileAtCommit(file, preGmudCommit);
    if (!content) { warn(`    ✘ ${file}`); continue; }
    const cleaned = cleanFilename(file);
    const dst = path.join(rollbackDir, cleaned);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, content);
    if (cleaned.endsWith('.cls') || cleaned.endsWith('.trigger')) {
      const meta = getFileAtCommit(file + '-meta.xml', preGmudCommit);
      if (meta) fs.writeFileSync(dst + '-meta.xml', meta);
    }
    log(`    ✔ ${file}`);
  }
}

function copyDestructiveFiles(files: string[], rollbackDir: string, log: (m: string) => void): void {
  log('  Preparando destructive...');
  for (const file of files) {
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
    log(`    ✘ ${file}`);
  }
}

function generateManifests(filesToDestroy: string[], filesToRestore: string[], rollbackDir: string, log: (m: string) => void): void {
  // Step 1: generate package.xml from everything in the folder
  log('  Gerando package.xml...');
  spawnSync('sf', ['project', 'generate', 'manifest', '--source-dir', rollbackDir, '--output-dir', rollbackDir], {
    encoding: 'utf8', stdio: ['inherit', 'inherit', 'pipe'],
  });

  if (filesToDestroy.length === 0) return;

  // Step 2: temp folder with only destructive files → generate destructiveChanges.xml
  const tempDir = path.join(PROJECT_DIR(), '_temp_destructive');
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  ensureSfdxProject(tempDir);

  for (const file of filesToDestroy) {
    const cleaned = cleanFilename(file);
    const src = path.join(rollbackDir, cleaned);
    const dst = path.join(tempDir, cleaned);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (fs.existsSync(src)) fs.copyFileSync(src, dst);
    if (fs.existsSync(src + '-meta.xml')) fs.copyFileSync(src + '-meta.xml', dst + '-meta.xml');
  }

  log('  Gerando destructiveChanges.xml...');
  spawnSync('sf', ['project', 'generate', 'manifest', '--source-dir', tempDir, '--name', 'destructiveChanges', '--output-dir', rollbackDir], {
    encoding: 'utf8', stdio: ['inherit', 'inherit', 'pipe'],
  });

  // Step 3: remove destructive files from rollback_deploy and regenerate package.xml
  for (const file of filesToDestroy) {
    const cleaned = cleanFilename(file);
    const target = path.join(rollbackDir, cleaned);
    if (fs.existsSync(target)) fs.unlinkSync(target);
    if (fs.existsSync(target + '-meta.xml')) fs.unlinkSync(target + '-meta.xml');
  }

  if (filesToRestore.length > 0) {
    log('  Regenerando package.xml...');
    fs.unlinkSync(path.join(rollbackDir, 'package.xml'));
    spawnSync('sf', ['project', 'generate', 'manifest', '--source-dir', rollbackDir, '--output-dir', rollbackDir], {
      encoding: 'utf8', stdio: ['inherit', 'inherit', 'pipe'],
    });
  } else {
    fs.writeFileSync(path.join(rollbackDir, 'package.xml'),
      '<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n  <version>62.0</version>\n</Package>\n', 'utf8');
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ── Command ──────────────────────────────────────────────────────────────

export default class PypelineCherryRollback extends SfCommand<PypelineCherryRollbackResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    gmud: Flags.string({ char: 'g', summary: messages.getMessage('flags.gmud.summary'), required: true }),
    'target-org': Flags.string({ summary: messages.getMessage('flags.target-org.summary'), default: 'devops' }),
    wait: Flags.integer({ char: 'w', summary: messages.getMessage('flags.wait.summary'), default: 240 }),
    'dry-run': Flags.boolean({ summary: messages.getMessage('flags.dry-run.summary'), default: false }),
  };

  public async run(): Promise<PypelineCherryRollbackResult> {
    const { flags } = await this.parse(PypelineCherryRollback);
    const gmudId = flags['gmud'];
    const targetOrg = flags['target-org'] ?? 'devops';
    const waitMin = String(flags['wait'] ?? 240);
    const rollbackDir = ROLLBACK_DIR();

    this.log('');
    this.log('╔══════════════════════════════════════════════╗');
    this.log('║       PYPELINE CHERRY-ROLLBACK               ║');
    this.log('╚══════════════════════════════════════════════╝');

    const tagCommit = getTagCommit(gmudId);
    const commits = getGmudCommits(gmudId);
    const preGmudCommit = findPreGmudCommit(commits);
    const { destroy: filesToDestroy, restore: filesToRestore } = splitFilesByAction(classifyGmudFiles(commits));

    this.log(`  GMUD: ${gmudId} | ${commits.length} commits | destroy: ${filesToDestroy.length} | restore: ${filesToRestore.length}`);
    this.log('');

    for (const f of filesToDestroy) this.log(`    ✘ ${f}`);
    for (const f of filesToRestore) this.log(`    ↩ ${f}`);

    if (filesToDestroy.length === 0 && filesToRestore.length === 0) {
      this.log('  Nenhuma alteração.');
      return { gmudId, filesToDestroy, filesToRestore, rollbackDir };
    }

    if (flags['dry-run']) {
      this.log('  [DRY-RUN]');
      return { gmudId, filesToDestroy, filesToRestore, rollbackDir };
    }

    const confirmed = await this.confirm({ message: `Gerar rollback para ${gmudId}?` });
    if (!confirmed) return { gmudId, filesToDestroy, filesToRestore, rollbackDir };

    prepareRollbackDir(rollbackDir);
    if (filesToRestore.length > 0) restoreFiles(filesToRestore, preGmudCommit, rollbackDir, (m) => this.log(m), (m) => this.warn(m));
    if (filesToDestroy.length > 0) copyDestructiveFiles(filesToDestroy, rollbackDir, (m) => this.log(m));
    generateManifests(filesToDestroy, filesToRestore, rollbackDir, (m) => this.log(m));

    writeFile(path.join(PROJECT_DIR(), 'cherry_rollback.json'),
      JSON.stringify({ gmudId, preGmudCommit, tagCommit, filesToDestroy, filesToRestore, timestamp: new Date().toISOString() }, null, 2));

    this.log('');
    this.log('  sf project deploy start \\');
    this.log('    --manifest rollback_deploy/package.xml \\');
    if (filesToDestroy.length > 0) {
      this.log('    --post-destructive-changes rollback_deploy/destructiveChanges.xml \\');
    }
    this.log(`    --target-org ${targetOrg} -w ${waitMin} --verbose --test-level RunLocalTests`);
    this.log('');

    return { gmudId, filesToDestroy, filesToRestore, rollbackDir };
  }
}
