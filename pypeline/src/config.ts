import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Resolução de caminhos em runtime ──────────────────────────────────────
//
// Todos os caminhos resolvem a partir de process.cwd() — o diretório onde
// o usuário executa o comando sf. O plugin pode ser instalado em qualquer
// máquina sem depender de uma estrutura de pastas específica.

export const PROJECT_DIR  = (): string => process.cwd();
export const LOCAL_DIR    = (): string => process.cwd();
export const SCRIPT_DIR   = path.dirname(new URL(import.meta.url).pathname);

// ── Arquivo de configuração local ─────────────────────────────────────────
//
// .pypeline.json na raiz do projeto Salesforce persiste as preferências
// definidas pelo usuário no sf pypeline init.
// Ordem de precedência: flag CLI → env var → .pypeline.json → default 'main'

export const PYPELINE_CONFIG_FILE = (): string => path.join(process.cwd(), '.pypeline.json');

export type PypelineConfig = {
  branch?: string;
};

export function readPypelineConfig(): PypelineConfig {
  const configFile = PYPELINE_CONFIG_FILE();
  if (!fs.existsSync(configFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(configFile, 'utf8')) as PypelineConfig;
  } catch {
    return {};
  }
}

export function writePypelineConfig(config: PypelineConfig): void {
  fs.writeFileSync(PYPELINE_CONFIG_FILE(), JSON.stringify(config, null, 2) + '\n', 'utf8');
}

// ── Nomes e pastas ─────────────────────────────────────────────────────────

export const PROJECT_NAME = 'build_deploy';

// Branch: flag CLI > PYPELINE_BRANCH env var > .pypeline.json > 'main'
export const BRANCH = process.env['PYPELINE_BRANCH'] ?? readPypelineConfig().branch ?? 'main';

export const BUILD_DIR  = (): string => path.join(process.cwd(), PROJECT_NAME);
export const SOURCE_DIR = (): string => path.join(BUILD_DIR(), 'force-app', 'main', 'default');

// ── Arquivos de estado ─────────────────────────────────────────────────────

export const BASELINE_FILE = (): string => path.join(process.cwd(), 'baseline.txt');
export const JOB_ID_FILE   = (): string => path.join(process.cwd(), 'prd_job_id.txt');

// ── Logs ───────────────────────────────────────────────────────────────────

export const LOG_PRD          = (): string => path.join(process.cwd(), 'deploy_prd_output.log');
export const LOG_TRAINING     = (): string => path.join(process.cwd(), 'deploy_training_output.log');
export const LOG_QUICK_DEPLOY = (): string => path.join(process.cwd(), 'quick_deploy_prd_output.log');

// ── Utilitários de arquivo ─────────────────────────────────────────────────

export function readFileTrimmed(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8').trim();
}

export function writeFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf8');
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function unlinkIfExists(filePath: string): void {
  try { fs.unlinkSync(filePath); } catch { /* noop */ }
}

// ── Utilitários Git ────────────────────────────────────────────────────────

export type GitDiff = {
  added: string[];
  modified: string[];
  deleted: string[];
  notDeleted: string[];
};

export function gitDiffFiles(commitHash: string): GitDiff {
  const output = execSync(`git diff --name-status ${commitHash} HEAD`, { encoding: 'utf8' });
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  const notDeleted: string[] = [];

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const [status, ...parts] = line.split('\t');
    const filepath = parts[parts.length - 1];
    if (status.startsWith('D')) {
      deleted.push(filepath);
    } else {
      notDeleted.push(filepath);
      if (status.startsWith('A')) added.push(filepath);
      else if (status.startsWith('M')) modified.push(filepath);
    }
  }
  return { added, modified, deleted, notDeleted };
}
