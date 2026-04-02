/**
 * test/helpers.ts
 *
 * Utilitários compartilhados pelos testes unit.
 */

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import sinon from 'sinon';

// ── Fixtures ───────────────────────────────────────────────────────────────

export const FAKE_COMMIT_HASH  = 'abc1234def5678901234567890abcdef12345678';
export const FAKE_NEW_BASELINE = 'zzz9999aaa0000bbb1111ccc2222ddd3333eee44';
export const FAKE_JOB_ID       = '0Af000000000001AAA';

export const FAKE_GIT_DIFF = [
  'M\tforce-app/main/default/classes/MyClass.cls',
  'A\tforce-app/main/default/classes/NewClass.cls',
  'D\tforce-app/main/default/classes/OldClass.cls',
].join('\n');

// ── Helper de assert para Promises ────────────────────────────────────────
/**
 * Wrapper tipado para usar rejectedWith sem unsafe-call.
 * Uso: await assertRejects(promise, /padrão/)
 */
export async function assertRejects(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected promise to reject with ${pattern.toString()} but it resolved.`);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('Expected promise to reject')) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (!pattern.test(msg)) {
      throw new Error(`Expected error message to match ${pattern.toString()} but got: "${msg}"`);
    }
  }
}

// ── Helpers de stub ────────────────────────────────────────────────────────

export function stubFs(
  sandbox: sinon.SinonSandbox,
  overrides: {
    existsSync?: boolean | Record<string, boolean>;
    readFileSync?: string;
  } = {}
): sinon.SinonStub {
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

export function stubExecSync(
  sandbox: sinon.SinonSandbox,
  overrides: Record<string, string> = {}
): sinon.SinonStub {
  return sandbox.stub(childProcess, 'execSync').callsFake((cmd: unknown) => {
    const cmdStr = String(cmd);
    for (const [pattern, result] of Object.entries(overrides)) {
      if (cmdStr.includes(pattern)) return result;
    }
    if (cmdStr.includes('git diff'))   return FAKE_GIT_DIFF;
    if (cmdStr.includes('rev-parse'))  return FAKE_NEW_BASELINE + '\n';
    if (cmdStr.includes('rev-list'))   return 'commit1\ncommit2\n';
    if (cmdStr.includes('git branch')) return '* release-v4.0.0\n';
    return '';
  });
}

export function stubSpawnSync(sandbox: sinon.SinonSandbox, status = 0): sinon.SinonStub {
  return sandbox.stub(childProcess, 'spawnSync').returns({
    status,
    pid: 1234,
    output: [],
    stdout: '',
    stderr: '',
    signal: null,
  });
}

export function stubSpawn(
  sandbox: sinon.SinonSandbox,
  options: { exitCode?: number; lines?: string[] } = {}
): sinon.SinonStub {
  const { exitCode = 0, lines = ['Deploy successful\n'] } = options;

  const fakeProc = {
    stdout: {
      on: (event: string, cb: (chunk: Buffer) => void): void => {
        if (event === 'data') {
          for (const line of lines) cb(Buffer.from(line));
        }
      },
    },
    stderr: {
      on: (): void => { /* noop */ },
    },
    on: (event: string, cb: (code: number) => void): void => {
      if (event === 'close') cb(exitCode);
    },
  };

  return sandbox.stub(childProcess, 'spawn').returns(fakeProc as never);
}

export function stubCreateWriteStream(
  sandbox: sinon.SinonSandbox
): { write: sinon.SinonStub; close: sinon.SinonStub; on: sinon.SinonStub } {
  const fakeStream = { write: sinon.stub(), close: sinon.stub(), on: sinon.stub() };
  sandbox.stub(fs, 'createWriteStream').returns(fakeStream as never);
  return fakeStream;
}
