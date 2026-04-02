/**
 * test/unit/commands/pypeline/quickdeploy.test.ts
 *
 * CONCEITO DE STUB EM MÉTODO DE INSTÂNCIA:
 * O quickdeploy chama this.confirm() para pedir confirmação interativa.
 * Em testes, precisamos substituir essa chamada para não travar
 * esperando input do teclado. Fazemos isso stubando o prototype:
 *
 *   sandbox.stub(PypelineQuickdeploy.prototype, 'confirm').resolves(true);
 */

import * as fs from 'node:fs';
import { expect } from 'chai';
import sinon from 'sinon';
import PypelineQuickdeploy from '../../../../src/commands/pypeline/quickdeploy.js';
import { FAKE_JOB_ID, stubSpawn, stubCreateWriteStream } from '../../../helpers.js';

describe('pypeline quickdeploy', () => {
  let sandbox: sinon.SinonSandbox;
  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => { sandbox.restore(); });

  function setupValidJobId() {
    sandbox.stub(fs, 'existsSync').returns(true);
    sandbox.stub(fs, 'readFileSync').returns(FAKE_JOB_ID + '\n');
    sandbox.stub(fs, 'writeFileSync');
    sandbox.stub(fs, 'unlinkSync');
    // Simula confirmação "sim"
    sandbox.stub(PypelineQuickdeploy.prototype, 'confirm').resolves(true);
  }

  // ── Happy path ─────────────────────────────────────────────────────────

  it('deve executar o quick deploy e retornar success quando tudo passa', async () => {
    setupValidJobId();
    stubSpawn(sandbox, { exitCode: 0, lines: ['Quick deploy successful\n'] });
    stubCreateWriteStream(sandbox);

    const result = await PypelineQuickdeploy.run([]);
    expect(result.success).to.be.true;
    expect(result.jobId).to.equal(FAKE_JOB_ID);
  });

  // ── Validação do Job ID ────────────────────────────────────────────────

  it('deve lançar erro se prd_job_id.txt não existir', async () => {
    sandbox.stub(fs, 'existsSync').returns(false);

    await expect(PypelineQuickdeploy.run([])).to.be.rejectedWith(/prd_job_id\.txt não encontrado/);
  });

  it('deve lançar erro se o Job ID tiver formato inválido', async () => {
    sandbox.stub(fs, 'existsSync').returns(true);
    sandbox.stub(fs, 'readFileSync').returns('ID_INVALIDO\n');
    sandbox.stub(fs, 'writeFileSync');
    sandbox.stub(fs, 'unlinkSync');

    await expect(PypelineQuickdeploy.run([])).to.be.rejectedWith(/formato inválido/);
  });

  it('deve aceitar Job ID via flag --job-id sem precisar do arquivo', async () => {
    // existsSync pode retornar false — o Job ID vem da flag
    sandbox.stub(fs, 'existsSync').returns(false);
    sandbox.stub(fs, 'writeFileSync');
    sandbox.stub(fs, 'unlinkSync');
    sandbox.stub(PypelineQuickdeploy.prototype, 'confirm').resolves(true);
    stubSpawn(sandbox, { exitCode: 0 });
    stubCreateWriteStream(sandbox);

    const result = await PypelineQuickdeploy.run(['--job-id', FAKE_JOB_ID]);
    expect(result.jobId).to.equal(FAKE_JOB_ID);
  });

  // ── Confirmação interativa ─────────────────────────────────────────────

  it('deve cancelar sem executar o deploy se o usuário recusar', async () => {
    setupValidJobId();
    // Sobrescreve confirm para retornar false (usuário digitou "N")
    (sandbox.stub(PypelineQuickdeploy.prototype, 'confirm') as sinon.SinonStub).resolves(false);
    const spawnStub = stubSpawn(sandbox, { exitCode: 0 });
    stubCreateWriteStream(sandbox);

    const result = await PypelineQuickdeploy.run([]);
    expect(result.success).to.be.false;
    expect(spawnStub.called).to.be.false; // spawn não deve ter sido chamado
  });

  it('com --no-prompt não deve chamar confirm', async () => {
    setupValidJobId();
    const confirmStub = sandbox.stub(PypelineQuickdeploy.prototype, 'confirm').resolves(true);
    stubSpawn(sandbox, { exitCode: 0 });
    stubCreateWriteStream(sandbox);

    await PypelineQuickdeploy.run(['--no-prompt']);
    expect(confirmStub.called).to.be.false;
  });

  // ── Falha no deploy ────────────────────────────────────────────────────

  it('deve lançar erro quando o quick deploy falha', async () => {
    setupValidJobId();
    stubSpawn(sandbox, { exitCode: 1, lines: ['Deploy failed\n'] });
    stubCreateWriteStream(sandbox);

    await expect(PypelineQuickdeploy.run([])).to.be.rejectedWith(/falhou com exit code 1/);
  });

  it('deve remover prd_job_id.txt após deploy bem-sucedido sem erros no log', async () => {
    setupValidJobId();
    stubSpawn(sandbox, { exitCode: 0, lines: ['All good\n'] });
    stubCreateWriteStream(sandbox);
    const readStub = sandbox.stub(fs, 'readFileSync');
    // Primeira leitura: prd_job_id.txt; segunda: log do deploy (sem erros)
    readStub.onFirstCall().returns(FAKE_JOB_ID + '\n');
    readStub.onSecondCall().returns('All good\n');
    const unlinkStub = sandbox.stub(fs, 'unlinkSync');

    await PypelineQuickdeploy.run(['--no-prompt']);
    // unlinkSync deve ter sido chamado para remover o arquivo de Job ID
    expect(unlinkStub.called).to.be.true;
  });
});
