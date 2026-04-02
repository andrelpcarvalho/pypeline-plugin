import * as fs from 'node:fs';
import * as path from 'node:path';
import { LOCAL_DIR } from './config.js';

// ── Caracteres especiais (octal → Unicode) ─────────────────────────────────

const SPECIAL_CHARS: Record<string, string> = {
  '\\\\303\\\\247': 'ç',
  '\\\\303\\\\272': 'ú',
  '\\\\303\\\\243': 'ã',
  '\\\\303\\\\255': 'í',
  '\\\\303\\\\241': 'á',
  '\\\\303\\\\264': 'ô',
  '\\\\303\\\\263': 'ó',
  '\\\\303\\\\251': 'é',
  '\\\\303\\\\265': 'õ',
};

function replaceSpecialChars(filename: string): string {
  for (const [escaped, char] of Object.entries(SPECIAL_CHARS)) {
    filename = filename.replace(new RegExp(escaped, 'g'), char);
  }
  return filename;
}

export function cleanFilename(filename: string): string {
  filename = replaceSpecialChars(filename);
  filename = filename.replace(/^"|"$/g, '');
  return filename;
}

// ── Funções de cópia ───────────────────────────────────────────────────────

function copyRecursive(src: string, dst: string): void {
  fs.cpSync(src, dst, { recursive: true, force: true });
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyClassMeta(cleanedFile: string, buildDir: string): void {
  const src = path.join(LOCAL_DIR, cleanedFile);
  const dst = path.join(buildDir, cleanedFile);
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
  const meta = cleanedFile + '-meta.xml';
  fs.copyFileSync(path.join(LOCAL_DIR, meta), path.join(buildDir, meta));
}

function copyExtensionFilePath(file: string, buildDir: string): void {
  const p       = path.parse(file);
  const upFile  = path.dirname(p.dir);          // parent of parent
  const destino = path.dirname(upFile);
  ensureDir(path.join(buildDir, destino));
  copyRecursive(path.join(LOCAL_DIR, upFile), path.join(buildDir, upFile));
  const metaName = `${path.basename(upFile)}.site-meta.xml`;
  const metaSrc  = path.join(LOCAL_DIR, destino, metaName);
  if (fs.existsSync(metaSrc)) {
    fs.copyFileSync(metaSrc, path.join(buildDir, destino, metaName));
  }
}

function copyComponentsPath(file: string, buildDir: string): void {
  const dirFile = path.dirname(file);
  const upFile  = path.dirname(dirFile);
  ensureDir(path.join(buildDir, upFile));
  copyRecursive(path.join(LOCAL_DIR, dirFile), path.join(buildDir, dirFile));
}

export function copyFile(file: string, buildDir: string): void {
  const cleaned = cleanFilename(file);
  if (cleaned.endsWith('.cls') || cleaned.endsWith('.trigger')) {
    copyClassMeta(cleaned, buildDir);
  } else if (cleaned.includes('/aura/') || cleaned.includes('/lwc/')) {
    copyComponentsPath(cleaned, buildDir);
  } else if (cleaned.includes('/experiences/')) {
    copyExtensionFilePath(cleaned, buildDir);
  } else {
    const src = path.join(LOCAL_DIR, cleaned);
    const dst = path.join(buildDir, cleaned);
    ensureDir(path.dirname(dst));
    fs.copyFileSync(src, dst);
  }
}
