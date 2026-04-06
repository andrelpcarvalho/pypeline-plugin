# Release

Sequência completa para publicar uma nova versão do plugin no npm.

## Pré-requisitos

- Estar logado no npm: `npm whoami` (se não estiver: `npm login`)
- Estar na pasta do plugin: `cd pypeline-plugin/pypeline`

---

## Sequência de publicação

```bash
# 1. Limpa artefatos anteriores (lib/ e cache do wireit)
yarn clean
Remove-Item -Recurse -Force .wireit

# 2. Valida o código
yarn lint

# 3. Compila o TypeScript diretamente (sem wireit para evitar cache)
npx tsc -p tsconfig.json

# 4. Gera o manifest de comandos do oclif
npx oclif manifest

# 5. Versiona (patch = bug fix, minor = nova feature, major = breaking change)
npm version patch

# 6. Publica no npm
npm publish

# 7. Atualiza o plugin instalado localmente
sf plugins uninstall pypeline
sf plugins install pypeline

# 8. Confirma
sf pypeline --help
sf pypeline version
```

## Tipos de versão

| Comando | Quando usar | Exemplo |
|---------|-------------|---------|
| `npm version patch` | Bug fix, ajuste pequeno | `1.1.2` → `1.1.3` |
| `npm version minor` | Nova feature, sem breaking change | `1.1.2` → `1.2.0` |
| `npm version major` | Breaking change | `1.1.2` → `2.0.0` |

## Observações

- O `npm version` cria automaticamente um commit git e uma tag com a nova versão.
- O `.wireit` pode cachear builds antigos e fazer o `yarn build` pular a compilação — sempre apague antes de publicar.
- O `oclif manifest` precisa rodar **após** o `tsc` para registrar todos os comandos corretamente. Se pular essa etapa, o `sf pypeline --help` pode não mostrar todos os comandos.
