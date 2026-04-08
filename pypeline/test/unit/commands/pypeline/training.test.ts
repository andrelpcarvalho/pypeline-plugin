import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep as pathSep } from 'node:path';
import esmock from 'esmock';
import { expect } from 'chai';
import sinon from 'sinon';
import type { EsmockModule, DeployTrainingResult } from '../../../types.js';
import { assertRejects, makeSpawnFake, makeWriteStream } from '../../../helpers.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const SRC        = resolve(currentDir, '../../../../src').split(pathSep).join('/');

const FAKE_LOG    = '/fake/deploy_training.log';
const FAKE_SOURCE = '/fake/source';
const BASE_CONFIG = { LOG_TRAINING: () => FAKE_LOG, SOURCE_DIR: () => FAKE_SOURCE, unlinkIfExists: sinon.spy() };

async function loadTraining(exitCode: number, lines = ['Deploy successful\n']): Promise<EsmockModule<DeployTrainingResult>> {
  const raw: unknown = await esmock(`${SRC}/commands/pypeline/training.js`, {
    'node:child_process': { spawn: makeSpawnFake({ exitCode, lines }) },
    'node:fs':            { createWriteStream: makeWriteStream, unlinkSync: sinon.spy() },
    [`${SRC}/config.js`]: BASE_CONFIG,
  });
  return raw as EsmockModule<DeployTrainingResult>;
}

describe('pypeline training', () => {
  it('deve retornar success: true quando o deploy passa', async () => {
    const { default: Cmd } = await loadTraining(0);
    const result = await Cmd.run([]);
    expect(result.success).to.equal(true);
  });

  it('deve lançar erro quando o deploy falha (exit code 1)', async () => {
    const { default: Cmd } = await loadTraining(1);
    await assertRejects(Cmd.run([]), /falhou com exit code 1/);
  });

  it('deve respeitar flag --target-org customizada', async () => {
    let capturedArgs: string[] = [];
    const raw: unknown = await esmock(`${SRC}/commands/pypeline/training.js`, {
      'node:child_process': {
        spawn: (_bin: string, args: string[]) => {
          capturedArgs = [...args];
          return { stdout: { on: (): void => {} }, stderr: { on: (): void => {} },
            on: (e: string, cb: (c: number) => void): void => { if (e === 'close') cb(0); } };
        },
      },
      'node:fs':            { createWriteStream: makeWriteStream, unlinkSync: sinon.spy() },
      [`${SRC}/config.js`]: BASE_CONFIG,
    });
    const { default: Cmd } = raw as EsmockModule<DeployTrainingResult>;
    await Cmd.run(['--target-org', 'minha-org-treino']);
    expect(capturedArgs).to.include('minha-org-treino');
  });

  it('deve respeitar flag --wait customizada', async () => {
    let capturedArgs: string[] = [];
    const raw: unknown = await esmock(`${SRC}/commands/pypeline/training.js`, {
      'node:child_process': {
        spawn: (_bin: string, args: string[]) => {
          capturedArgs = [...args];
          return { stdout: { on: (): void => {} }, stderr: { on: (): void => {} },
            on: (e: string, cb: (c: number) => void): void => { if (e === 'close') cb(0); } };
        },
      },
      'node:fs':            { createWriteStream: makeWriteStream, unlinkSync: sinon.spy() },
      [`${SRC}/config.js`]: BASE_CONFIG,
    });
    const { default: Cmd } = raw as EsmockModule<DeployTrainingResult>;
    await Cmd.run(['--wait', '60']);
    expect(capturedArgs).to.include('60');
  });
});
