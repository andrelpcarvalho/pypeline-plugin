/**
 * test/unit/commands/pypeline/quickdeploy.test.ts
 */

import * as fs from 'node:fs';
import { expect } from 'chai';
import sinon from 'sinon';
import PypelineQuickdeploy from '../../../../src/commands/pypeline/quickdeploy.js';
import { FAKE_JOB_ID, assertRejects, stubSpawn, stubCreateWriteStream } from '../../../helpers.js';

describe('pypeline quickdeploy', () => {
  let sandbox: sinon.SinonSandbox;
  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => { sandbox.restore(); });

  function setupValidJobId(): void {
    sandbox.stub(fs, 'existsSync').returns(true);
    sandbox.stub(fs, 'readFileSync').returns(FAKE_JOB_ID + '\n');
    sandbox.stub(fs, 'writeFileSync');
    sandbox.stub(fs, 'unlinkSync');
    sandbox.stub(PypelineQuickdeploy.prototype, 'confirm').resolves(true);
  }

  it('deve executar o quick deploy e retornar success quando tudo passa', async () => {
    setupValidJobId();
    stubSpawn(sandbox, { exitCode: 0, lines: ['Quick deploy successful\n'] });
    stubCreateWriteStream(sandbox);
    const result = await PypelineQuickdeploy.run([]);
    expect(result.success).to.equal(true);
    expect(result.jobId).to.equal(FAKE_JOB_ID);
  });

  it('deve lançar erro se prd_job_id.txt não existir', async () => {
    sandbox.stub(fs, 'existsSync').returns(false);
    await assertRejects(PypelineQuickdeploy.run([]), /prd_job_id\.txt não encontrado/);
  });

  it('deve lançar erro se o Job ID tiver formato inválido', async () => {
    sandbox.stub(fs, 'existsSync').returns(true);
    sandbox.stub(fs, 'readFileSync').returns('ID_INVALIDO\n');
    sandbox.stub(fs, 'writeFileSync');
    sandbox.stub(fs, 'unlinkSync');
    await assertRejects(PypelineQuickdeploy.run([]), /formato inválido/);
  });

  it('deve aceitar Job ID via flag --job-id sem precisar do arquivo', async () => {
    sandbox.stub(fs, 'existsSync').returns(false);
    sandbox.stub(fs, 'writeFileSync');
    sandbox.stub(fs, 'unlinkSync');
    sandbox.stub(PypelineQuickdeploy.prototype, 'confirm').resolves(true);
    stubSpawn(sandbox, { exitCode: 0 });
    stubCreateWriteStream(sandbox);
    const result = await PypelineQuickdeploy.run(['--job-id', FAKE_JOB_ID]);
    expect(result.jobId).to.equal(FAKE_JOB_ID);
  });

  it('deve cancelar sem executar o deploy se o usuário recusar', async () => {
    sandbox.stub(fs, 'existsSync').returns(true);
    sandbox.stub(fs, 'readFileSync').returns(FAKE_JOB_ID + '\n');
    sandbox.stub(fs, 'writeFileSync');
    sandbox.stub(fs, 'unlinkSync');
    sandbox.stub(PypelineQuickdeploy.prototype, 'confirm').resolves(false);
    const spawnStub = stubSpawn(sandbox, { exitCode: 0 });
    stubCreateWriteStream(sandbox);
    const result = await PypelineQuickdeploy.run([]);
    expect(result.success).to.equal(false);
    expect(spawnStub.callCount).to.equal(0);
  });

  it('com --no-prompt não deve chamar confirm', async () => {
    setupValidJobId();
    const confirmStub = sandbox.stub(PypelineQuickdeploy.prototype, 'confirm').resolves(true);
    stubSpawn(sandbox, { exitCode: 0 });
    stubCreateWriteStream(sandbox);
    await PypelineQuickdeploy.run(['--no-prompt']);
    expect(confirmStub.callCount).to.equal(0);
  });

  it('deve lançar erro quando o quick deploy falha', async () => {
    setupValidJobId();
    stubSpawn(sandbox, { exitCode: 1, lines: ['Deploy failed\n'] });
    stubCreateWriteStream(sandbox);
    await assertRejects(PypelineQuickdeploy.run([]), /falhou com exit code 1/);
  });

  it('deve remover prd_job_id.txt após deploy bem-sucedido', async () => {
    sandbox.stub(fs, 'existsSync').returns(true);
    const readStub = sandbox.stub(fs, 'readFileSync');
    readStub.onFirstCall().returns(FAKE_JOB_ID + '\n');
    readStub.onSecondCall().returns('All good\n');
    sandbox.stub(fs, 'writeFileSync');
    const unlinkStub = sandbox.stub(fs, 'unlinkSync');
    sandbox.stub(PypelineQuickdeploy.prototype, 'confirm').resolves(true);
    stubSpawn(sandbox, { exitCode: 0, lines: ['All good\n'] });
    stubCreateWriteStream(sandbox);
    await PypelineQuickdeploy.run(['--no-prompt']);
    expect(unlinkStub.called).to.equal(true);
  });
});
