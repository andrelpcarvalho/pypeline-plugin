import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Resolução dinâmica de caminhos ─────────────────────────────────────────

export function findProjectDir(marker = 'workspace_bash'): string {
  const current = path.dirname(new URL(import.meta.url).pathname);
  const parts = current.split(path.sep);
  for (let i = parts.length; i > 0; i--) {
    const candidate = parts.slice(0, i).join(path.sep);
    if (path.basename(candidate) === marker) return candidate;
  }
  throw new Error(
    `Pasta raiz '${marker}' não encontrada na hierarquia de diretórios.\n` +
    `Verifique se os scripts estão dentro de '${marker}' ou ajuste o marker em config.ts.`
  );
}

export const SCRIPT_DIR  = path.dirname(new URL(import.meta.url).pathname);
export const PROJECT_DIR = findProjectDir('workspace_bash');
export const LOCAL_DIR   = path.join(PROJECT_DIR, 'sforce-sfdc-bvsa-organization');

// ── Nomes e pastas ─────────────────────────────────────────────────────────

export const PROJECT_NAME = 'build_deploy';
export const BRANCH       = 'release-v4.0.0';

export const BUILD_DIR  = path.join(PROJECT_DIR, PROJECT_NAME);
export const SOURCE_DIR = path.join(BUILD_DIR, 'force-app', 'main', 'default');

// ── Arquivos de estado ─────────────────────────────────────────────────────

export const BASELINE_FILE = path.join(PROJECT_DIR, 'baseline.txt');
export const JOB_ID_FILE   = path.join(PROJECT_DIR, 'prd_job_id.txt');

// ── Logs ───────────────────────────────────────────────────────────────────

export const LOG_PRD          = path.join(PROJECT_DIR, 'deploy_prd_output.log');
export const LOG_TRAINING     = path.join(PROJECT_DIR, 'deploy_training_output.log');
export const LOG_QUICK_DEPLOY = path.join(PROJECT_DIR, 'quick_deploy_prd_output.log');

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
