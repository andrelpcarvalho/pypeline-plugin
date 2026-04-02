import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep as pathSep } from 'node:path';
import esmock from 'esmock';
import { expect } from 'chai';
import sinon from 'sinon';

const currentDir = dirname(fileURLToPath(import.meta.url));
const SRC        = resolve(currentDir, '../../src').split(pathSep).join('/');

type FileUtilsModule = {
  cleanFilename: (s: string) => string;
  copyFile: (file: string, buildDir: string) => void;
};

async function loadFileUtils(fsOverrides: Record<string, unknown> = {}): Promise<FileUtilsModule> {
  const raw: unknown = await esmock(`${SRC}/fileUtils.js`, {
    'node:fs': { existsSync: () => false, copyFileSync: sinon.spy(),
      cpSync: sinon.spy(), mkdirSync: sinon.spy(), ...fsOverrides },
    [`${SRC}/config.js`]: { LOCAL_DIR: () => '/fake/local' },
  });
  return raw as FileUtilsModule;
}

describe('fileUtils.ts', () => {
  describe('cleanFilename', () => {
    it('deve remover aspas duplas nas bordas', async () => {
      const mod = await loadFileUtils();
      expect(mod.cleanFilename('"MyClass.cls"')).to.equal('MyClass.cls');
    });

    it('deve converter sequência octal para ç', async () => {
      const mod = await loadFileUtils();
      expect(mod.cleanFilename('informa\\303\\247ao.cls')).to.include('ç');
    });

    it('não deve alterar nomes sem caracteres especiais', async () => {
      const mod = await loadFileUtils();
      expect(mod.cleanFilename('MyClass.cls')).to.equal('MyClass.cls');
    });
  });

  describe('copyFile', () => {
    it('deve copiar arquivo .cls e seu -meta.xml', async () => {
      const copyFileSync = sinon.spy();
      const mod = await loadFileUtils({ copyFileSync });
      mod.copyFile('force-app/main/default/classes/MyClass.cls', '/build');
      expect(copyFileSync.callCount).to.equal(2);
      const dsts = (copyFileSync.args as unknown[][]).map((a) => String(a[1]));
      expect(dsts.some((p) => p.endsWith('MyClass.cls'))).to.equal(true);
      expect(dsts.some((p) => p.endsWith('MyClass.cls-meta.xml'))).to.equal(true);
    });

    it('deve chamar cpSync para componentes LWC', async () => {
      const cpSync = sinon.spy();
      const mod = await loadFileUtils({ cpSync });
      mod.copyFile('force-app/main/default/lwc/myComp/myComp.html', '/build');
      expect(cpSync.callCount).to.equal(1);
    });

    it('deve chamar cpSync para componentes Aura', async () => {
      const cpSync = sinon.spy();
      const mod = await loadFileUtils({ cpSync });
      mod.copyFile('force-app/main/default/aura/myComp/myComp.cmp', '/build');
      expect(cpSync.callCount).to.equal(1);
    });

    it('deve usar copyFileSync para outros tipos', async () => {
      const copyFileSync = sinon.spy();
      const cpSync = sinon.spy();
      const mod = await loadFileUtils({ copyFileSync, cpSync });
      mod.copyFile('force-app/main/default/objects/Account/fields/MyField.field-meta.xml', '/build');
      expect(copyFileSync.callCount).to.equal(1);
      expect(cpSync.callCount).to.equal(0);
    });
  });
});
