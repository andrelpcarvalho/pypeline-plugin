import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep as pathSep } from 'node:path';
import esmock from 'esmock';
import { expect } from 'chai';
import sinon from 'sinon';
import type { EsmockModule, QuickdeployResult } from '../../../types.js';
import { FAKE_JOB_ID, assertRejects, makeSpawnFake, makeWriteStream } from '../../../helpers.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const SRC        = resolve(currentDir, '../../../../src').split(pathSep).join('/');

const FAKE_LOG      = '/fake/quick_deploy.log';
const FAKE_JOB_FILE = '/fake/prd_job_id.txt';

async function loadQuickdeploy(opts: {
  jobIdExists?: boolean; jobId?: string; exitCode?: number; logContent?: string;
}): Promise<EsmockModule<QuickdeployResult>> {
  const { jobIdExists = true, jobId = FAKE_JOB_ID, exitCode = 0, logContent = 'All good' } = opts;
  const raw: unknown = await esmock(`${SRC}/commands/pypeline/quickdeploy.js`, {
    'node:child_process': { spawn: makeSpawnFake({ exitCode, lines: [logContent + '\n'] }) },
    'node:fs': { existsSync: () => jobIdExists, readFileSync: () => logContent,
      writeFileSync: sinon.spy(), unlinkSync: sinon.spy(), createWriteStream: makeWriteStream },
    [`${SRC}/config.js`]: { JOB_ID_FILE: () => FAKE_JOB_FILE, LOG_QUICK_DEPLOY: () => FAKE_LOG,
      fileExists: () => jobIdExists, readFileTrimmed: () => jobId, unlinkIfExists: sinon.spy() },
  });
  return raw as EsmockModule<QuickdeployResult>;
}

describe('pypeline quickdeploy', () => {
  it('deve retornar success: true quando tudo passa', async () => {
    const { default: Cmd } = await loadQuickdeploy({});
    (Cmd.prototype as { confirm?: () => Promise<boolean> }).confirm = async () => true;
    const result = await Cmd.run(['--no-prompt']);
    expect(result.success).to.equal(true);
    expect(result.jobId).to.equal(FAKE_JOB_ID);
  });

  it('deve lançar erro se prd_job_id.txt não existir', async () => {
    const { default: Cmd } = await loadQuickdeploy({ jobIdExists: false });
    await assertRejects(Cmd.run([]), /prd_job_id\.txt não encontrado/);
  });

  it('deve lançar erro se o Job ID tiver formato inválido', async () => {
    const { default: Cmd } = await loadQuickdeploy({ jobId: 'ID_INVALIDO' });
    await assertRejects(Cmd.run([]), /formato inválido/);
  });

  it('deve aceitar Job ID via flag --job-id', async () => {
    const { default: Cmd } = await loadQuickdeploy({ jobIdExists: false });
    const result = await Cmd.run(['--job-id', FAKE_JOB_ID, '--no-prompt']);
    expect(result.jobId).to.equal(FAKE_JOB_ID);
  });

  it('deve lançar erro quando o quick deploy falha', async () => {
    const { default: Cmd } = await loadQuickdeploy({ exitCode: 1 });
    (Cmd.prototype as { confirm?: () => Promise<boolean> }).confirm = async () => true;
    await assertRejects(Cmd.run(['--no-prompt']), /falhou com exit code 1/);
  });

  it('com --no-prompt não deve chamar confirm', async () => {
    const { default: Cmd } = await loadQuickdeploy({});
    const confirmSpy = sinon.spy(async () => true);
    (Cmd.prototype as { confirm?: sinon.SinonSpy }).confirm = confirmSpy;
    await Cmd.run(['--no-prompt']);
    expect(confirmSpy.callCount).to.equal(0);
  });
});
