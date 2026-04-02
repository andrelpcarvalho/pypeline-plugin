/**
 * test/helpers.ts
 *
 * Utilitários compartilhados pelos testes unit.
 *
 * CONCEITO: "stub" é um dublê que substitui uma função real durante o teste.
 * Ex: em vez de chamar fs.existsSync de verdade (que lê o disco),
 *     substituímos por uma função falsa que retorna o valor que precisamos.
 */

import * as fs from 'node:fs';
import * as childProcess from 'node:child_process';
import sinon from 'sinon';

// ── Fixtures (dados falsos reutilizáveis) ──────────────────────────────────

export const FAKE_COMMIT_HASH  = 'abc1234def5678901234567890abcdef12345678';
export const FAKE_NEW_BASELINE = 'zzz9999aaa0000bbb1111ccc2222ddd3333eee44';
export const FAKE_JOB_ID       = '0Af000000000001AAA';

export const FAKE_GIT_DIFF = [
  'M\tforce-app/main/default/classes/MyClass.cls',
  'A\tforce-app/main/default/classes/NewClass.cls',
  'D\tforce-app/main/default/classes/OldClass.cls',
].join('\n');

// ── Helpers de stub ────────────────────────────────────────────────────────

/**
 * Cria stubs padrão para o sistema de arquivos.
 * Evita qualquer leitura/escrita real em disco durante os testes.
 */
export function stubFs(sandbox: sinon.SinonSandbox, overrides: {
  existsSync?: boolean | Record<string, boolean>;
  readFileSync?: string;
  mkdirSync?: void;
  writeFileSync?: void;
  rmSync?: void;
  copyFileSync?: void;
  cpSync?: void;
  unlinkSync?: void;
} = {}) {
  // existsSync: aceita um booleano fixo ou um mapa de path → boolean
  const existsSyncStub = sandbox.stub(fs, 'existsSync');
  if (typeof overrides.existsSync === 'object') {
    existsSyncStub.callsFake((p: unknown) =>
      (overrides.existsSync as Record<string, boolean>)[String(p)] ?? false
    );
  } else {
    existsSyncStub.returns(overrides.existsSync ?? true);
  }

  sandbox.stub(fs, 'readFileSync').returns(overrides.readFileSync ?? FAKE_COMMIT_HASH + '\n');
  sandbox.stub(fs, 'writeFileSync').returns(undefined);
  sandbox.stub(fs, 'mkdirSync').returns(undefined);
  sandbox.stub(fs, 'rmSync').returns(undefined);
  sandbox.stub(fs, 'copyFileSync').returns(undefined);
  sandbox.stub(fs, 'cpSync').returns(undefined);
  sandbox.stub(fs, 'unlinkSync').returns(undefined);

  return existsSyncStub;
}

/**
 * Cria stubs para execSync (git commands).
 * Por padrão retorna strings que simulam saídas comuns do git.
 */
export function stubExecSync(sandbox: sinon.SinonSandbox, overrides: Record<string, string> = {}) {
  return sandbox.stub(childProcess, 'execSync').callsFake((cmd: unknown) => {
    const cmdStr = String(cmd);
    for (const [pattern, result] of Object.entries(overrides)) {
      if (cmdStr.includes(pattern)) return result;
    }
    if (cmdStr.includes('git diff'))      return FAKE_GIT_DIFF;
    if (cmdStr.includes('rev-parse'))     return FAKE_NEW_BASELINE + '\n';
    if (cmdStr.includes('rev-list'))      return 'commit1\ncommit2\n';
    if (cmdStr.includes('git branch'))    return '* release-v4.0.0\n';
    return '';
  });
}

/**
 * Cria um stub para spawnSync (comandos sf como project generate).
 * Por padrão simula sucesso (status: 0).
 */
export function stubSpawnSync(sandbox: sinon.SinonSandbox, status = 0) {
  return sandbox.stub(childProcess, 'spawnSync').returns({
    status,
    pid: 1234,
    output: [],
    stdout: '',
    stderr: '',
    signal: null,
  });
}

/**
 * Cria um stub para spawn (processos com stream de output).
 * Emite linhas de log e termina com o código fornecido.
 */
export function stubSpawn(sandbox: sinon.SinonSandbox, options: {
  exitCode?: number;
  lines?: string[];
} = {}) {
  const { exitCode = 0, lines = ['Deploy successful\n'] } = options;

  // Simulamos um EventEmitter mínimo para imitar o objeto retornado por spawn()
  const fakeProc = {
    stdout: {
      on: (event: string, cb: (chunk: Buffer) => void) => {
        if (event === 'data') {
          for (const line of lines) cb(Buffer.from(line));
        }
      },
    },
    stderr: {
      on: (_event: string, _cb: unknown) => { /* noop */ },
    },
    on: (event: string, cb: (code: number) => void) => {
      if (event === 'close') cb(exitCode);
    },
  };

  return sandbox.stub(childProcess, 'spawn').returns(fakeProc as never);
}

/**
 * Cria um stub para fs.createWriteStream — evita criar arquivos de log reais.
 */
export function stubCreateWriteStream(sandbox: sinon.SinonSandbox) {
  const fakeStream = {
    write: sinon.stub(),
    close: sinon.stub(),
    on: sinon.stub(),
  };
  sandbox.stub(fs, 'createWriteStream').returns(fakeStream as never);
  return fakeStream;
}
