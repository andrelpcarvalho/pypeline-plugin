/**
 * test/unit/fileUtils.test.ts
 *
 * Testa a lógica de cópia e limpeza de nomes de arquivo.
 *
 * CONCEITO DE STUB vs MOCK:
 * - Stub: substitui uma função e define o que ela retorna.
 * - Mock: além de substituir, verifica se foi chamada de certo jeito.
 * Aqui usamos principalmente stubs, pois queremos testar COMPORTAMENTO
 * (o que a função faz), não chamadas específicas.
 */

import * as fs from 'node:fs';
import { expect } from 'chai';
import sinon from 'sinon';
import { cleanFilename, copyFile } from '../../src/fileUtils.js';

describe('fileUtils.ts', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => { sandbox.restore(); });

  // ── cleanFilename ──────────────────────────────────────────────────────

  describe('cleanFilename', () => {
    it('deve remover aspas duplas nas bordas', () => {
      expect(cleanFilename('"force-app/main/default/classes/MyClass.cls"'))
        .to.equal('force-app/main/default/classes/MyClass.cls');
    });

    it('deve converter sequência octal \\303\\247 para ç', () => {
      expect(cleanFilename('informa\\303\\247ao.cls')).to.include('informaçao');
    });

    it('deve converter \\303\\243 para ã', () => {
      expect(cleanFilename('configura\\303\\243o.cls')).to.include('configuraão');
    });

    it('não deve alterar nomes sem caracteres especiais', () => {
      expect(cleanFilename('MyClass.cls')).to.equal('MyClass.cls');
    });

    it('deve lidar com string vazia', () => {
      expect(cleanFilename('')).to.equal('');
    });
  });

  // ── copyFile ───────────────────────────────────────────────────────────

  describe('copyFile', () => {
    // Antes de testar copyFile, precisamos mockar todo acesso a disco
    let copyFileStub: sinon.SinonStub;
    let mkdirStub: sinon.SinonStub;
    let cpSyncStub: sinon.SinonStub;
    let existsStub: sinon.SinonStub;

    beforeEach(() => {
      copyFileStub = sandbox.stub(fs, 'copyFileSync');
      mkdirStub    = sandbox.stub(fs, 'mkdirSync');
      cpSyncStub   = sandbox.stub(fs, 'cpSync');
      existsStub   = sandbox.stub(fs, 'existsSync').returns(false);
    });

    it('deve copiar arquivo .cls e seu -meta.xml', () => {
      const file = 'force-app/main/default/classes/MyClass.cls';
      copyFile(file, '/build');

      // copyFileSync deve ser chamado 2x: o .cls e o -meta.xml
      expect(copyFileStub.callCount).to.equal(2);
      const calls = copyFileStub.args.map((a) => String(a[1]));
      expect(calls.some((p) => p.endsWith('MyClass.cls'))).to.be.true;
      expect(calls.some((p) => p.endsWith('MyClass.cls-meta.xml'))).to.be.true;
    });

    it('deve copiar arquivo .trigger e seu -meta.xml', () => {
      const file = 'force-app/main/default/triggers/MyTrigger.trigger';
      copyFile(file, '/build');
      expect(copyFileStub.callCount).to.equal(2);
    });

    it('deve chamar cpSync para componentes LWC', () => {
      const file = 'force-app/main/default/lwc/myComp/myComp.html';
      copyFile(file, '/build');
      expect(cpSyncStub.calledOnce).to.be.true;
    });

    it('deve chamar cpSync para componentes Aura', () => {
      const file = 'force-app/main/default/aura/myComp/myComp.cmp';
      copyFile(file, '/build');
      expect(cpSyncStub.calledOnce).to.be.true;
    });

    it('deve chamar cpSync para arquivos /experiences/', () => {
      const file = 'force-app/main/default/experiences/site/views/Home.json';
      copyFile(file, '/build');
      expect(cpSyncStub.calledOnce).to.be.true;
    });

    it('deve usar copyFileSync simples para outros tipos de arquivo', () => {
      const file = 'force-app/main/default/objects/Account/fields/MyField.field-meta.xml';
      copyFile(file, '/build');
      expect(copyFileStub.calledOnce).to.be.true;
      expect(cpSyncStub.called).to.be.false;
    });
  });
});
