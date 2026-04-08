import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  BASELINE_FILE,
  BRANCH,
  fileExists,
  readFileTrimmed,
  gitDiffFiles,
} from '../../config.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.diff');

type FileEntry = {
  status: 'A' | 'M' | 'D';
  file: string;
  metadataType: string;
};

export type PypelineDiffResult = {
  baseline: string;
  head: string;
  files: FileEntry[];
  totalAdded: number;
  totalModified: number;
  totalDeleted: number;
};

// Infere o metadata type com base no path do arquivo.
function inferMetadataType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const dir = filePath.toLowerCase();

  if (dir.includes('/lwc/'))          return 'LightningComponentBundle';
  if (dir.includes('/aura/'))         return 'AuraDefinitionBundle';
  if (dir.includes('/classes/'))      return 'ApexClass';
  if (dir.includes('/triggers/'))     return 'ApexTrigger';
  if (dir.includes('/pages/'))        return 'ApexPage';
  if (dir.includes('/components/'))   return 'ApexComponent';
  if (dir.includes('/objects/'))      return 'CustomObject';
  if (dir.includes('/layouts/'))      return 'Layout';
  if (dir.includes('/flows/'))        return 'Flow';
  if (dir.includes('/profiles/'))     return 'Profile';
  if (dir.includes('/permissionsets/')) return 'PermissionSet';
  if (dir.includes('/tabs/'))         return 'CustomTab';
  if (dir.includes('/staticresources/')) return 'StaticResource';
  if (dir.includes('/labels/'))       return 'CustomLabels';
  if (dir.includes('/flexipages/'))   return 'FlexiPage';
  if (dir.includes('/experiences/'))  return 'ExperienceBundle';
  if (dir.includes('/queues/'))       return 'Queue';
  if (dir.includes('/email/'))        return 'EmailTemplate';
  if (dir.includes('/reports/'))      return 'Report';
  if (dir.includes('/dashboards/'))   return 'Dashboard';

  if (ext === '.cls')       return 'ApexClass';
  if (ext === '.trigger')   return 'ApexTrigger';
  if (ext === '.page')      return 'ApexPage';
  if (ext === '.component') return 'ApexComponent';

  return 'Unknown';
}

export default class PypelineDiff extends SfCommand<PypelineDiffResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    branch: Flags.string({
      char: 'b',
      summary: messages.getMessage('flags.branch.summary'),
      default: BRANCH,
    }),
    json: Flags.boolean({
      summary: messages.getMessage('flags.json.summary'),
      default: false,
    }),
  };

  public async run(): Promise<PypelineDiffResult> {
    const { flags } = await this.parse(PypelineDiff);

    if (!fileExists(BASELINE_FILE())) {
      this.error('baseline.txt não encontrado. Execute sf pypeline init primeiro.');
    }

    const baseline = readFileTrimmed(BASELINE_FILE());
    const head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

    if (baseline === head) {
      this.log('');
      this.log('Nenhuma alteração desde o último baseline.');
      this.log(`  Baseline = HEAD = ${baseline.slice(0, 12)}...`);
      this.log('');
      return { baseline, head, files: [], totalAdded: 0, totalModified: 0, totalDeleted: 0 };
    }

    const diff = gitDiffFiles(baseline);

    const files: FileEntry[] = [
      ...diff.added.map((f): FileEntry => ({ status: 'A', file: f, metadataType: inferMetadataType(f) })),
      ...diff.modified.map((f): FileEntry => ({ status: 'M', file: f, metadataType: inferMetadataType(f) })),
      ...diff.deleted.map((f): FileEntry => ({ status: 'D', file: f, metadataType: inferMetadataType(f) })),
    ];

    if (flags['json']) {
      // O SfCommand cuida do --json nativamente, mas respeitamos a flag custom também
      return {
        baseline,
        head,
        files,
        totalAdded: diff.added.length,
        totalModified: diff.modified.length,
        totalDeleted: diff.deleted.length,
      };
    }

    this.log('');
    this.log('╔══════════════════════════════════════════════╗');
    this.log('║           PYPELINE DIFF PREVIEW              ║');
    this.log('╚══════════════════════════════════════════════╝');
    this.log('');
    this.log(`  Baseline : ${baseline.slice(0, 12)}...`);
    this.log(`  HEAD     : ${head.slice(0, 12)}...`);
    this.log(`  Branch   : ${flags['branch'] ?? BRANCH}`);
    this.log('');

    // ── Tabela formatada ──────────────────────────────────────────────────
    const STATUS_LABEL: Record<string, string> = { A: '[ADD]', M: '[MOD]', D: '[DEL]' };
    const STATUS_COLOR: Record<string, string> = { A: '\x1b[32m', M: '\x1b[33m', D: '\x1b[31m' };
    const RESET = '\x1b[0m';

    // Agrupa por metadata type
    const grouped = new Map<string, FileEntry[]>();
    for (const entry of files) {
      const group = grouped.get(entry.metadataType) ?? [];
      group.push(entry);
      grouped.set(entry.metadataType, group);
    }

    for (const [metaType, entries] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      this.log(`  ── ${metaType} (${entries.length}) ${'─'.repeat(Math.max(1, 40 - metaType.length))}`);
      for (const entry of entries) {
        const color = STATUS_COLOR[entry.status] ?? '';
        const label = STATUS_LABEL[entry.status] ?? entry.status;
        this.log(`    ${color}${label}${RESET} ${entry.file}`);
      }
      this.log('');
    }

    // ── Resumo ────────────────────────────────────────────────────────────
    this.log('────────────────────────────────────────────────');
    this.log(`  Total: ${files.length} arquivo(s) — \x1b[32m+${diff.added.length}\x1b[0m adicionados  \x1b[33m~${diff.modified.length}\x1b[0m modificados  \x1b[31m-${diff.deleted.length}\x1b[0m deletados`);
    this.log('');

    return {
      baseline,
      head,
      files,
      totalAdded: diff.added.length,
      totalModified: diff.modified.length,
      totalDeleted: diff.deleted.length,
    };
  }
}
