import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep as pathSep } from 'node:path';
import esmock from 'esmock';
import { expect } from 'chai';
import sinon from 'sinon';
import type { EsmockModule, RunResult } from '../../../types.js';
import { FAKE_COMMIT_HASH, FAKE_JOB_ID, FAKE_NEW_BASELINE, assertRejects } from '../../../helpers.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const SRC        = resolve(currentDir, '../../../../src').split(pathSep).join('/');

const FAKE_BASELINE = '/fake/baseline.txt';
const FAKE_JOB_FILE = '/fake/prd_job_id.txt';
const FAKE_LOG_PRD  = '/fake/deploy_prd.log';
const FAKE_LOG_TR   = '/fake/deploy_training.log';

type SpawnExitCodes = { build?: number; package?: number; training?: number; validate?: number };

function makeSpawnStub(codes: Required<SpawnExitCodes>): (_bin: string, args: readonly string[]) => unknown {
  return (_bin: string, args: readonly string[]) => {
    let code = 0;
    if (args.includes('build'))    code = codes.build;
    if (args.includes('package'))  code = codes.package;
    if (args.includes('training')) code = codes.training;
    if (args.includes('validate')) code = codes.validate;
    return {
      stdout: { on: (): void => {} }, stderr: { on: (): void => {} },
      on: (e: string, cb: (c: number) => void): void => { if (e === 'close') setTimeout(() => cb(code), 0); },
    };
  };
}

function makeConfig(logContent: string, baselineExists: boolean): Record<string, unknown> {
  return {
    BASELINE_FILE: () => FAKE_BASELINE, JOB_ID_FILE:   () => FAKE_JOB_FILE,
    LOG_PRD:       () => FAKE_LOG_PRD,  LOG_TRAINING:  () => FAKE_LOG_TR,
    SCRIPT_DIR:    '/fake/script',
    fileExists:    () => baselineExists,
    readFileTrimmed: (p: string) => String(p).includes('baseline') ? FAKE_COMMIT_HASH : logContent,
    writeFile: sinon.spy(),
  };
}

function makeFs(logContent: string, baselineExists: boolean): Record<string, unknown> {
  return {
    existsSync:    (p: string) => baselineExists || !String(p).includes('baseline'),
    readFileSync:  (p: string) => String(p).includes('baseline') ? FAKE_COMMIT_HASH + '\n' : logContent,
    writeFileSync: sinon.spy(),
    unlinkSync:    sinon.spy(),
  };
}

async function loadRun(opts: {
  exitCodes?: SpawnExitCodes; logContent?: string; baselineExists?: boolean;
}): Promise<EsmockModule<RunResult>> {
  const { exitCodes = {}, logContent = `Status : Succeeded\nJob ID: ${FAKE_JOB_ID}`, baselineExists = true } = opts;
  const codes = { build: 0, package: 0, training: 0, validate: 0, ...exitCodes };

  const raw: unknown = await esmock(`${SRC}/commands/pypeline/run.js`, {
    'node:child_process': { spawn: makeSpawnStub(codes) },
    'node:fs':            makeFs(logContent, baselineExists),
    [`${SRC}/config.js`]: makeConfig(logContent, baselineExists),
  });
  return raw as EsmockModule<RunResult>;
}

describe('pypeline run', () => {
  beforeEach(() => { process.env['PYPELINE_NOVO_BASELINE'] = FAKE_NEW_BASELINE; });
  afterEach(() => { delete process.env['PYPELINE_NOVO_BASELINE']; });

  it('deve concluir com sucesso quando todas as etapas passam', async () => {
    const { default: Cmd } = await loadRun({});
    const result = await Cmd.run([]);
    expect(result.success).to.equal(true);
    expect(result.jobId).to.equal(FAKE_JOB_ID);
  });

  it('deve gravar o novoBaseline calculado pelo build', async () => {
    const { default: Cmd } = await loadRun({});
    const result = await Cmd.run([]);
    expect(result.baselineUpdated).to.equal(FAKE_NEW_BASELINE);
  });

  it('por padrão não deve chamar pypeline training', async () => {
    let trainingCalled = false;
    const logContent = `Status : Succeeded\nJob ID: ${FAKE_JOB_ID}`;
    const raw: unknown = await esmock(`${SRC}/commands/pypeline/run.js`, {
      'node:child_process': {
        spawn: (_bin: string, args: readonly string[]) => {
          if (args.includes('training')) trainingCalled = true;
          return { stdout: { on: (): void => {} }, stderr: { on: (): void => {} },
            on: (e: string, cb: (c: number) => void): void => { if (e === 'close') setTimeout(() => cb(0), 0); } };
        },
      },
      'node:fs':            makeFs(logContent, true),
      [`${SRC}/config.js`]: makeConfig(logContent, true),
    });
    const { default: Cmd } = raw as EsmockModule<RunResult>;
    await Cmd.run([]);
    expect(trainingCalled).to.equal(false);
  });

  it('com --training deve chamar pypeline training', async () => {
    let trainingCalled = false;
    const logContent = `Status : Succeeded\nJob ID: ${FAKE_JOB_ID}`;
    const raw: unknown = await esmock(`${SRC}/commands/pypeline/run.js`, {
      'node:child_process': {
        spawn: (_bin: string, args: readonly string[]) => {
          if (args.includes('training')) trainingCalled = true;
          return { stdout: { on: (): void => {} }, stderr: { on: (): void => {} },
            on: (e: string, cb: (c: number) => void): void => { if (e === 'close') setTimeout(() => cb(0), 0); } };
        },
      },
      'node:fs':            makeFs(logContent, true),
      [`${SRC}/config.js`]: makeConfig(logContent, true),
    });
    const { default: Cmd } = raw as EsmockModule<RunResult>;
    await Cmd.run(['--training']);
    expect(trainingCalled).to.equal(true);
  });

  it('deve fazer rollback se o log contiver "Status : Failed"', async () => {
    const { default: Cmd } = await loadRun({ logContent: 'Status : Failed' });
    await assertRejects(Cmd.run([]), /validate-prd/);
  });

  it('não deve fazer rollback se o log não contiver "Status : Failed"', async () => {
    const { default: Cmd } = await loadRun({ logContent: `Status : Succeeded\nJob ID: ${FAKE_JOB_ID}` });
    const result = await Cmd.run([]);
    expect(result.success).to.equal(true);
  });

  it('deve fazer rollback se o build falhar', async () => {
    const { default: Cmd } = await loadRun({ exitCodes: { build: 1 } });
    await assertRejects(Cmd.run([]), /pypeline build/);
  });

  it('deve fazer rollback se o package falhar', async () => {
    const { default: Cmd } = await loadRun({ exitCodes: { package: 1 } });
    await assertRejects(Cmd.run([]), /pypeline package/);
  });

  it('deve fazer rollback se o validate PRD falhar', async () => {
    const { default: Cmd } = await loadRun({ exitCodes: { validate: 1 } });
    await assertRejects(Cmd.run([]), /pypeline validate-prd/);
  });

  it('deve falhar imediatamente se baseline.txt não existir', async () => {
    const { default: Cmd } = await loadRun({ baselineExists: false });
    await assertRejects(Cmd.run([]), /baseline\.txt não encontrado/);
  });
});
