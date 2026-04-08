import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  PYPELINE_CONFIG_FILE,
  fileExists,
  readPypelineConfig,
  writePypelineConfig,
  type PypelineConfig,
} from '../../config.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('pypeline', 'pypeline.config');

// ── Tipo expandido para o alpha ───────────────────────────────────────────
// A PypelineConfig original só tem `branch`. Aqui adicionamos campos extras
// que o config command gerencia. O config.ts será atualizado para aceitar
// esses campos quando o alpha for mergeado.
type ExtendedConfig = PypelineConfig & {
  prdOrg?: string;
  trainingOrg?: string;
  testLevel?: string;
  waitMinutes?: number;
  ci?: boolean;
};

function readExtendedConfig(): ExtendedConfig {
  return readPypelineConfig() as ExtendedConfig;
}

function writeExtendedConfig(config: ExtendedConfig): void {
  writePypelineConfig(config as PypelineConfig);
}

export type PypelineConfigResult = {
  action: 'list' | 'get' | 'set' | 'unset';
  config: ExtendedConfig;
};

const VALID_KEYS = ['branch', 'prdOrg', 'trainingOrg', 'testLevel', 'waitMinutes', 'ci'] as const;
type ValidKey = typeof VALID_KEYS[number];

function isValidKey(key: string): key is ValidKey {
  return (VALID_KEYS as readonly string[]).includes(key);
}

export default class PypelineConfigCmd extends SfCommand<PypelineConfigResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    list: Flags.boolean({
      summary: messages.getMessage('flags.list.summary'),
      default: false,
      exclusive: ['set', 'unset', 'get'],
    }),
    get: Flags.string({
      summary: messages.getMessage('flags.get.summary'),
      exclusive: ['list', 'set', 'unset'],
    }),
    set: Flags.string({
      summary: messages.getMessage('flags.set.summary'),
      exclusive: ['list', 'get', 'unset'],
    }),
    unset: Flags.string({
      summary: messages.getMessage('flags.unset.summary'),
      exclusive: ['list', 'get', 'set'],
    }),
    value: Flags.string({
      summary: messages.getMessage('flags.value.summary'),
      dependsOn: ['set'],
    }),
  };

  public async run(): Promise<PypelineConfigResult> {
    const { flags } = await this.parse(PypelineConfigCmd);

    const configFile = PYPELINE_CONFIG_FILE();
    let config = readExtendedConfig();

    // ── LIST (default quando nenhuma flag) ─────────────────────────────
    if (flags['list'] || (!flags['get'] && !flags['set'] && !flags['unset'])) {
      this.log('');
      this.log('╔══════════════════════════════════════════════╗');
      this.log('║         PYPELINE CONFIG                      ║');
      this.log('╚══════════════════════════════════════════════╝');
      this.log('');

      if (!fileExists(configFile)) {
        this.log('  (nenhuma configuração — usando defaults)');
        this.log(`  Arquivo: ${configFile}`);
      } else {
        this.log(`  Arquivo: ${configFile}`);
        this.log('');
        for (const key of VALID_KEYS) {
          const val = config[key as keyof ExtendedConfig];
          if (val !== undefined) {
            this.log(`  ${key.padEnd(16)} = ${String(val)}`);
          } else {
            this.log(`  ${key.padEnd(16)} = (default)`);
          }
        }
      }

      this.log('');
      this.log('  Chaves válidas: ' + VALID_KEYS.join(', '));
      this.log('');

      return { action: 'list', config };
    }

    // ── GET ────────────────────────────────────────────────────────────
    if (flags['get']) {
      const key = flags['get'];
      if (!isValidKey(key)) {
        this.error(`Chave inválida: ${key}\nChaves válidas: ${VALID_KEYS.join(', ')}`);
      }
      const val = config[key as keyof ExtendedConfig];
      this.log(val !== undefined ? String(val) : '(não definido)');
      return { action: 'get', config };
    }

    // ── SET ────────────────────────────────────────────────────────────
    if (flags['set']) {
      const key = flags['set'];
      if (!isValidKey(key)) {
        this.error(`Chave inválida: ${key}\nChaves válidas: ${VALID_KEYS.join(', ')}`);
      }
      const value = flags['value'];
      if (value === undefined) {
        this.error('Use --value para definir o valor. Ex: --set branch --value main');
      }

      // Conversão de tipo para campos numéricos e booleanos
      if (key === 'waitMinutes') {
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) this.error('waitMinutes deve ser um número positivo.');
        (config as Record<string, unknown>)[key] = num;
      } else if (key === 'ci') {
        (config as Record<string, unknown>)[key] = value === 'true';
      } else {
        (config as Record<string, unknown>)[key] = value;
      }

      writeExtendedConfig(config);
      this.log(`✔ ${key} = ${value}`);
      return { action: 'set', config };
    }

    // ── UNSET ──────────────────────────────────────────────────────────
    if (flags['unset']) {
      const key = flags['unset'];
      if (!isValidKey(key)) {
        this.error(`Chave inválida: ${key}\nChaves válidas: ${VALID_KEYS.join(', ')}`);
      }
      delete (config as Record<string, unknown>)[key];
      writeExtendedConfig(config);
      this.log(`✔ ${key} removido (usando default).`);
      return { action: 'unset', config };
    }

    return { action: 'list', config };
  }
}
