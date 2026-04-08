import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep as pathSep } from 'node:path';
import esmock from 'esmock';
import { expect } from 'chai';
import sinon from 'sinon';
import type { EsmockModule, ValidatePrdResult } from '../../../types.js';
import { FAKE_JOB_ID, assertRejects, makeSpawnFake, makeWriteStream } from '../../../helpers.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const SRC        = resolve(currentDir, '../../../../src').split(pathSep).join('/');

const FAKE_LOG      = '/fake/deploy_prd.log';
const FAKE_SOURCE   = '/fake/source';
const FAKE_JOB_FILE = '/fake/prd_job_id.txt';
const BASE_CONFIG   = { LOG_PRD: () => FAKE_LOG, SOURCE_DIR: () => FAKE_SOURCE,
  JOB_ID_FILE: () => FAKE_JOB_FILE, unlinkIfExists: sinon.spy(), writeFile: sinon.spy() };
const BASE_FS       = { createWriteStream: makeWriteStream, unlinkSync: sinon.spy(), writeFileSync: sinon.spy(),
  readFileSync: () => '', existsSync: () => true };

async function loadPrd(lines: string[], exitCode = 0): Promise<EsmockModule<ValidatePrdResult>> {
  const raw: unknown = await esmock(`${SRC}/commands/pypeline/validate-prd.js`, {
    'node:child_process': { spawn: makeSpawnFake({ exitCode, lines }) },
    'node:fs':            BASE_FS,
    [`${SRC}/config.js`]: BASE_CONFIG,
  });
  return raw as EsmockModule<ValidatePrdResult>;
}

describe('pypeline validate-prd', () => {
  it('deve extrair o Job ID do output e salvá-lo', async () => {
    const { default: Cmd } = await loadPrd([`Job ID: ${FAKE_JOB_ID}\n`]);
    const result = await Cmd.run([]);
    expect(result.jobId).to.equal(FAKE_JOB_ID);
  });

  it('deve retornar jobId null se não houver Job ID no log', async () => {
    const { default: Cmd } = await loadPrd(['Validate done, no job id here\n']);
    const result = await Cmd.run([]);
    expect(result.jobId).to.equal(null);
  });

  it('deve lançar erro quando o validate falha', async () => {
    const { default: Cmd } = await loadPrd(['Error: deploy failed\n'], 1);
    await assertRejects(Cmd.run([]), /falhou com exit code 1/);
  });

  it('deve aceitar Job ID no meio de uma linha', async () => {
    const { default: Cmd } = await loadPrd([`[sf] Validation Job ${FAKE_JOB_ID} queued\n`]);
    const result = await Cmd.run([]);
    expect(result.jobId).to.equal(FAKE_JOB_ID);
  });

  it('deve respeitar --target-org customizada', async () => {
    let capturedArgs: string[] = [];
    const raw: unknown = await esmock(`${SRC}/commands/pypeline/validate-prd.js`, {
      'node:child_process': {
        spawn: (_bin: string, args: string[]) => {
          capturedArgs = [...args];
          return {
            stdout: { on: (e: string, cb: (c: Buffer) => void): void => { if (e === 'data') cb(Buffer.from('')); } },
            stderr: { on: (): void => {} },
            on:     (e: string, cb: (c: number) => void): void => { if (e === 'close') cb(0); },
          };
        },
      },
      'node:fs':            BASE_FS,
      [`${SRC}/config.js`]: BASE_CONFIG,
    });
    const { default: Cmd } = raw as EsmockModule<ValidatePrdResult>;
    await Cmd.run(['--target-org', 'producao']);
    expect(capturedArgs).to.include('producao');
  });
});
