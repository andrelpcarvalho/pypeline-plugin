/**
 * test/unit/fileUtils.test.ts
 */

import * as fs from 'node:fs';
import { expect } from 'chai';
import sinon from 'sinon';
import { cleanFilename, copyFile } from '../../src/fileUtils.js';

describe('fileUtils.ts', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => { sandbox.restore(); });

  describe('cleanFilename', () => {
    it('deve remover aspas duplas nas bordas', () => {
      expect(cleanFilename('"MyClass.cls"')).to.equal('MyClass.cls');
    });

    it('deve converter sequência octal para ç', () => {
      expect(cleanFilename('informa\\303\\247ao.cls')).to.include('ç');
    });

    it('deve converter sequência octal para ã', () => {
      expect(cleanFilename('configura\\303\\243o.cls')).to.include('ã');
    });

    it('não deve alterar nomes sem caracteres especiais', () => {
      expect(cleanFilename('MyClass.cls')).to.equal('MyClass.cls');
    });

    it('deve lidar com string vazia', () => {
      expect(cleanFilename('')).to.equal('');
    });
  });

  describe('copyFile', () => {
    let copyFileStub: sinon.SinonStub;
    let cpSyncStub: sinon.SinonStub;

    beforeEach(() => {
      copyFileStub = sandbox.stub(fs, 'copyFileSync');
      cpSyncStub   = sandbox.stub(fs, 'cpSync');
      sandbox.stub(fs, 'mkdirSync');
      sandbox.stub(fs, 'existsSync').returns(false);
    });

    it('deve copiar arquivo .cls e seu -meta.xml', () => {
      copyFile('force-app/main/default/classes/MyClass.cls', '/build');
      expect(copyFileStub.callCount).to.equal(2);
      const dsts = copyFileStub.args.map((a: unknown[]) => String(a[1]));
      expect(dsts.some((p) => p.endsWith('MyClass.cls'))).to.equal(true);
      expect(dsts.some((p) => p.endsWith('MyClass.cls-meta.xml'))).to.equal(true);
    });

    it('deve copiar arquivo .trigger e seu -meta.xml', () => {
      copyFile('force-app/main/default/triggers/MyTrigger.trigger', '/build');
      expect(copyFileStub.callCount).to.equal(2);
    });

    it('deve chamar cpSync para componentes LWC', () => {
      copyFile('force-app/main/default/lwc/myComp/myComp.html', '/build');
      expect(cpSyncStub.callCount).to.equal(1);
    });

    it('deve chamar cpSync para componentes Aura', () => {
      copyFile('force-app/main/default/aura/myComp/myComp.cmp', '/build');
      expect(cpSyncStub.callCount).to.equal(1);
    });

    it('deve chamar cpSync para arquivos /experiences/', () => {
      copyFile('force-app/main/default/experiences/site/views/Home.json', '/build');
      expect(cpSyncStub.callCount).to.equal(1);
    });

    it('deve usar copyFileSync simples para outros tipos', () => {
      copyFile('force-app/main/default/objects/Account/fields/MyField.field-meta.xml', '/build');
      expect(copyFileStub.callCount).to.equal(1);
      expect(cpSyncStub.callCount).to.equal(0);
    });
  });
});
