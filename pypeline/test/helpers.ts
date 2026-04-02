/**
 * test/helpers.ts
 *
 * Com ESM puro, sinon.stub(fs, 'method') não funciona porque módulos ESM
 * são imutáveis. Usamos esmock para substituir módulos inteiros antes
 * da importação do código que queremos testar.
 */

import sinon from 'sinon';

export const FAKE_COMMIT_HASH  = 'abc1234def5678901234567890abcdef12345678';
export const FAKE_NEW_BASELINE = 'zzz9999aaa0000bbb1111ccc2222ddd3333eee44';
export const FAKE_JOB_ID       = '0Af000000000001AAA';

export const FAKE_GIT_DIFF = [
  'M\tforce-app/main/default/classes/MyClass.cls',
  'A\tforce-app/main/default/classes/NewClass.cls',
  'D\tforce-app/main/default/classes/OldClass.cls',
].join('\n');

// ── assertRejects ──────────────────────────────────────────────────────────

export async function assertRejects(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected promise to reject with ${pattern.toString()} but it resolved.`);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('Expected promise to reject')) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (!pattern.test(msg)) {
      throw new Error(`Expected error to match ${pattern.toString()} but got: "${msg}"`);
    }
  }
}

// ── Fakes para node:child_process ─────────────────────────────────────────

export function makeSpawnFake(options: { exitCode?: number; lines?: string[] } = {}): () => unknown {
  const { exitCode = 0, lines = ['Deploy successful\n'] } = options;
  return () => ({
    stdout: {
      on: (event: string, cb: (chunk: Buffer) => void): void => {
        if (event === 'data') for (const line of lines) cb(Buffer.from(line));
      },
    },
    stderr: { on: (): void => { /* noop */ } },
    on: (event: string, cb: (code: number) => void): void => {
      if (event === 'close') cb(exitCode);
    },
  });
}

export function makeSpawnSyncFake(status = 0): () => unknown {
  return () => ({ status, pid: 1234, output: [], stdout: '', stderr: '', signal: null });
}

export function makeExecSyncFake(overrides: Record<string, string> = {}): (cmd: string) => string {
  return (cmd: string): string => {
    for (const [pattern, result] of Object.entries(overrides)) {
      if (cmd.includes(pattern)) return result;
    }
    if (cmd.includes('git diff'))   return FAKE_GIT_DIFF;
    if (cmd.includes('rev-parse'))  return FAKE_NEW_BASELINE + '\n';
    if (cmd.includes('rev-list'))   return 'commit1\ncommit2\n';
    if (cmd.includes('git branch')) return '* release-v4.0.0\n';
    return '';
  };
}

// ── Fake de writeStream ────────────────────────────────────────────────────

export function makeWriteStream(): { write: sinon.SinonSpy; close: sinon.SinonSpy; on: sinon.SinonSpy } {
  return { write: sinon.spy(), close: sinon.spy(), on: sinon.spy() };
}
