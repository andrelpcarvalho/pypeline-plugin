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

// Mapa de diretório → metadata type (lookup por includes)
const DIR_TYPE_MAP: Array<[string, string]> = [
  ['/lwc/', 'LightningComponentBundle'],
  ['/aura/', 'AuraDefinitionBundle'],
  ['/classes/', 'ApexClass'],
  ['/triggers/', 'ApexTrigger'],
  ['/pages/', 'ApexPage'],
  ['/components/', 'ApexComponent'],
  ['/objects/', 'CustomObject'],
  ['/layouts/', 'Layout'],
  ['/flows/', 'Flow'],
  ['/profiles/', 'Profile'],
  ['/permissionsets/', 'PermissionSet'],
  ['/tabs/', 'CustomTab'],
  ['/staticresources/', 'StaticResource'],
  ['/labels/', 'CustomLabels'],
  ['/flexipages/', 'FlexiPage'],
  ['/experiences/', 'ExperienceBundle'],
  ['/queues/', 'Queue'],
  ['/email/', 'EmailTemplate'],
  ['/reports/', 'Report'],
  ['/dashboards/', 'Dashboard'],
];

const EXT_TYPE_MAP: Record<string, string> = {
  '.cls': 'ApexClass',
  '.trigger': 'ApexTrigger',
  '.page': 'ApexPage',
  '.component': 'ApexComponent',
};

function inferMetadataType(filePath: string): string {
  const lower = filePath.toLowerCase();
  const dirMatch = DIR_TYPE_MAP.find(([dir]) => lower.includes(dir));
  if (dirMatch) return dirMatch[1];
  return EXT_TYPE_MAP[path.extname(filePath).toLowerCase()] ?? 'Unknown';
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
