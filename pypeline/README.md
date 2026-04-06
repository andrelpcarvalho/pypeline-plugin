# pypeline — SF CLI Plugin

Pipeline DevOps Salesforce completo como plugin nativo do `sf` CLI. Orquestra build, geração de package.xml, validação em PRD e quick deploy a partir de um repositório git.

---

## Índice

- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração inicial](#configuração-inicial)
- [Como buildar o plugin](#como-buildar-o-plugin)
- [Comandos disponíveis](#comandos-disponíveis)
- [Fluxo completo de uso](#fluxo-completo-de-uso)
- [Testes](#testes)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Solução de problemas](#solução-de-problemas)

---

## Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- **Node.js** >= 18.0.0
- **Yarn** (recomendado) ou npm
- **Salesforce CLI** (`sf`) >= 2.x — instale com `npm install -g @salesforce/cli`
- **Git** configurado no PATH

Verifique as versões:

```bash
node --version    # deve ser >= 18
sf --version      # deve ser >= 2
git --version
```

---

## Instalação

### Opção 1 — Link local (desenvolvimento)

É o modo recomendado enquanto você está desenvolvendo o plugin:

```bash
# 1. Entre na pasta do plugin
cd pypeline

# 2. Instale as dependências
yarn install

# 3. Compile o TypeScript
yarn build

# 4. Linke o plugin no sf CLI local
sf plugins link .
```

Após o link, o plugin fica disponível globalmente no seu `sf`:

```bash
sf pypeline --help
```

Para atualizar o plugin após alterar código, recompile e o link já pega automaticamente:

```bash
yarn build
```

### Opção 2 — Instalação a partir de um diretório (sem publicar no npm)

```bash
sf plugins install /caminho/absoluto/para/pypeline
```

### Opção 3 — Publicar no npm e instalar

```bash
# Dentro da pasta do plugin
npm version patch   # ou minor / major
yarn build
npm publish

# Em qualquer máquina
sf plugins install pypeline
```

---

## Configuração inicial

Antes de usar o pipeline, você precisa de dois arquivos na pasta onde o plugin será executado:

### 1. `baseline.txt`

Contém o hash do commit git que serve como ponto de partida do diff. O pipeline copia apenas os arquivos alterados **a partir desse commit**.

```bash
# Criar com o hash atual (ponto zero)
git rev-parse HEAD > baseline.txt

# Ou com um commit específico
echo "abc1234def5678..." > baseline.txt
```

### 2. Autenticação das orgs no sf CLI

O pipeline usa dois aliases de org por padrão:

| Alias | Finalidade |
|-------|-----------|
| `devops` | Org de produção (PRD) |
| `treino` | Org de treinamento |

Autentique cada uma:

```bash
sf org login web --alias devops
sf org login web --alias treino
```

Para usar aliases diferentes, passe as flags `--prd-org` e `--training-org` nos comandos.

---

## Como buildar o plugin

O projeto usa **TypeScript** compilado via `tsc` com **wireit** para cache incremental.

```bash
# Build completo (compila + lint)
yarn build

# Limpar os artefatos de build
yarn clean

# Limpar tudo (incluindo node_modules)
yarn clean-all
```

Os arquivos compilados ficam em `lib/` — é o que o sf CLI carrega em produção.

> **Atenção:** nunca edite arquivos em `lib/` diretamente. Sempre edite em `src/` e recompile.

---

## Comandos disponíveis

### `sf pypeline run` — Pipeline completo

Executa todas as etapas em sequência. O deploy em Training roda em paralelo ao validate PRD se a flag `--training` for passada. Em caso de falha em qualquer etapa, faz rollback automático do `baseline.txt`.

```bash
# Execução padrão (sem training)
sf pypeline run

# Habilitando o deploy em Training
sf pypeline run --training

# Com branch customizada
sf pypeline run --branch release-v5.0.0

# Com orgs customizadas
sf pypeline run --prd-org minha-producao --training-org minha-homolog

# Simulando o build sem copiar arquivos
sf pypeline run --dry-run
```

**Flags disponíveis:**

| Flag | Padrão | Descrição |
|------|--------|-----------|
| `--branch, -b` | valor em `config.ts` | Branch git para checkout no build |
| `--training` | `false` | Habilita o deploy em Training (opt-in) |
| `--dry-run` | `false` | Simula o build sem tocar em arquivos |
| `--prd-org` | `devops` | Alias da org de produção |
| `--training-org` | `treino` | Alias da org de treinamento |

> **Nota:** o deploy em Training é **opt-in** — por padrão não roda. Use `--training` para habilitá-lo.

---

### `sf pypeline build` — Etapa 1

Faz checkout da branch, git pull, calcula o diff desde o baseline e copia os arquivos alterados para a pasta de build.

```bash
sf pypeline build
sf pypeline build --branch release-v5.0.0
sf pypeline build --dry-run
```

Arquivos gerados após a execução:

```
build_deploy/                          ← pasta com os arquivos do deploy
lista_arquivos_adicionados.txt
lista_arquivos_modificados.txt
lista_arquivos_deletados.txt
lista_arquivos_naodeletados.txt
```

---

### `sf pypeline package` — Etapa 2

Gera o `package.xml` a partir da pasta de build usando `sf project generate manifest`.

```bash
sf pypeline package
```

---

### `sf pypeline deploy training` — Etapa 3 (opcional)

Deploy na org de treinamento com `RunLocalTests`. Grava output em `deploy_training_output.log`.

```bash
sf pypeline deploy training
sf pypeline deploy training --target-org minha-org-treino
sf pypeline deploy training --wait 120
```

| Flag | Padrão | Descrição |
|------|--------|-----------|
| `--target-org, -o` | `treino` | Alias da org de treinamento |
| `--wait, -w` | `240` | Minutos de espera pelo resultado |

---

### `sf pypeline validate prd` — Etapa 4

Valida o deploy em produção (sem efetivá-lo). Extrai o Job ID do output e salva em `prd_job_id.txt`. Grava output em `deploy_prd_output.log`.

```bash
sf pypeline validate prd
sf pypeline validate prd --target-org minha-producao
```

| Flag | Padrão | Descrição |
|------|--------|-----------|
| `--target-org, -o` | `devops` | Alias da org de produção |
| `--wait, -w` | `240` | Minutos de espera pela validação |

---

### `sf pypeline quickdeploy` — Quick deploy

Executa o quick deploy em produção usando o Job ID salvo. O Job ID expira **10 horas** após o validate. Remove `prd_job_id.txt` após sucesso para evitar reuso.

```bash
# Lê o Job ID de prd_job_id.txt automaticamente
sf pypeline quickdeploy

# Passando o Job ID diretamente (sem precisar do arquivo)
sf pypeline quickdeploy --job-id 0Af000000000001AAA

# Sem confirmação interativa (para CI/CD)
sf pypeline quickdeploy --no-prompt
```

| Flag | Padrão | Descrição |
|------|--------|-----------|
| `--target-org, -o` | `devops` | Alias da org de produção |
| `--job-id, -j` | lê do arquivo | Job ID da validação |
| `--wait, -w` | `240` | Minutos de espera |
| `--no-prompt` | `false` | Pula a confirmação interativa |

---

### `sf pypeline version` — Versão do plugin

Exibe a versão instalada do plugin e verifica se há uma versão mais recente disponível no npm.

```bash
sf pypeline version
```

Exemplo de saída (versão atual):

```
pypeline/1.1.2 (current)

You are running the latest version.
```

Exemplo de saída (update disponível):

```
pypeline/1.1.2 (current)

 ›   Warning: pypeline update available from 1.1.2 to 1.2.0.
 ›   Run sf plugins update pypeline to update.
```

---

## Fluxo completo de uso

### Fluxo padrão (recomendado)

```bash
# 1. Execute o pipeline completo (sem training)
sf pypeline run

# 2. Quando o pipeline terminar com sucesso, o Job ID fica salvo.
#    Execute o quick deploy (feito pelo time de PRD):
sf pypeline quickdeploy
```

### Fluxo com training

```bash
# Habilita o deploy em Training (roda em paralelo ao validate PRD)
sf pypeline run --training
sf pypeline quickdeploy
```

### Fluxo manual (etapa por etapa)

Útil para depurar ou reexecutar apenas uma etapa:

```bash
# Etapa 1: build
sf pypeline build

# Etapa 2: gerar package.xml
sf pypeline package

# Etapa 3: deploy em Training (opcional, em background)
sf pypeline deploy training &

# Etapa 4: validar em PRD (síncrono)
sf pypeline validate prd

# Após validação bem-sucedida:
sf pypeline quickdeploy
```

### Fluxo com rollback

Se qualquer etapa do `sf pypeline run` falhar, o `baseline.txt` é restaurado automaticamente para o valor anterior. Nenhuma alteração é promovida.

Você pode verificar o motivo da falha nos logs:

```bash
cat deploy_prd_output.log
cat deploy_training_output.log
```

---

## Testes

### Instalar dependências de teste

As dependências de teste já estão no `package.json`. Basta instalar:

```bash
yarn install
```

### Rodar os unit tests

Rápidos, sem necessidade de org ou internet. Testam toda a lógica do plugin com mocks ESM via `esmock`.

```bash
# Rodar unit tests (49 testes)
yarn test:only

# Rodar com relatório de cobertura
yarn test:coverage
```

O relatório de cobertura é gerado em `coverage/lcov-report/index.html`. Cobertura atual: **~95% de statements**.

### Rodar todos os testes (unit + lint + type-check)

```bash
yarn test
```

### Rodar os NUT tests (integração com org real)

Os NUT tests rodam o plugin de verdade contra uma org Salesforce. São lentos e opcionais.

```bash
# NUTs básicos (build + package — não tocam em nenhuma org)
NUT_ORG_ALIAS=treino yarn test:nuts

# Habilitar o validate prd no NUT (roda contra a org real)
RUN_VALIDATE_NUT=1 NUT_ORG_ALIAS=treino yarn test:nuts

# Habilitar o quick deploy no NUT (só roda se prd_job_id.txt existir)
RUN_QUICKDEPLOY_NUT=1 NUT_ORG_ALIAS=treino yarn test:nuts
```

> **Atenção:** nunca sete `RUN_VALIDATE_NUT` ou `RUN_QUICKDEPLOY_NUT` em pipelines de CI/CD automáticos sem revisão, pois esses testes fazem operações reais em orgs Salesforce.

### Estrutura dos testes

```
test/
├── helpers.ts                              ← fakes reutilizáveis (fs, spawn, git)
├── types.ts                                ← tipos compartilhados (EsmockModule<T>, etc.)
├── unit/
│   ├── config.test.ts                      ← readFileTrimmed, gitDiffFiles, fileExists...
│   ├── fileUtils.test.ts                   ← cleanFilename, copyFile
│   └── commands/pypeline/
│       ├── build.test.ts
│       ├── package.test.ts
│       ├── quickdeploy.test.ts
│       ├── run.test.ts                     ← rollback, paralelismo, flags
│       ├── deploy/training.test.ts
│       └── validate/prd.test.ts            ← extração do Job ID
└── nuts/
    └── pypeline.nut.ts                     ← testes contra org real
```

---

## Estrutura do projeto

```
pypeline/
├── src/
│   ├── config.ts                     ← caminhos, constantes, utilitários git/fs
│   ├── fileUtils.ts                  ← lógica de cópia de arquivos Salesforce
│   └── commands/pypeline/
│       ├── run.ts                    ← sf pypeline run
│       ├── build.ts                  ← sf pypeline build
│       ├── package.ts                ← sf pypeline package
│       ├── quickdeploy.ts            ← sf pypeline quickdeploy
│       ├── version.ts                ← sf pypeline version
│       ├── deploy/
│       │   └── training.ts           ← sf pypeline deploy training
│       └── validate/
│           └── prd.ts                ← sf pypeline validate prd
├── messages/
│   ├── pypeline.run.md
│   ├── pypeline.build.md
│   ├── pypeline.package.md
│   ├── pypeline.quickdeploy.md
│   ├── pypeline.version.md
│   ├── pypeline.deploy.training.md
│   └── pypeline.validate.prd.md
├── test/
│   ├── helpers.ts
│   ├── types.ts
│   ├── unit/
│   └── nuts/
├── lib/                              ← compilado pelo tsc (não editar)
├── .mocharc.json                     ← configuração do runner de testes
├── .nycrc                            ← configuração de cobertura nyc
├── package.json
└── tsconfig.json
```

---

## Solução de problemas

**`sf: command not found` ao linkar o plugin**

Verifique se o sf CLI está instalado globalmente: `npm install -g @salesforce/cli`

**`baseline.txt não encontrado`**

Crie o arquivo com `git rev-parse HEAD > baseline.txt` na raiz do seu workspace.

**Job ID não encontrado após o validate**

O Job ID é extraído por regex do output do `sf project deploy validate`. Se o formato do output mudar em versões futuras do sf CLI, ajuste o pattern `0Af[0-9A-Za-z]{15}` em `src/commands/pypeline/validate/prd.ts`.

**Job ID expirado**

Quick deploy Job IDs expiram 10 horas após a validação. Re-execute `sf pypeline validate prd` para gerar um novo.

**Plugin não atualiza após alterar o código**

Execute `yarn build` — o symlink do `sf plugins link` aponta para `lib/`, que é substituído a cada build.

**Cobertura de testes abaixo do esperado**

Execute `yarn test:coverage` para ver o relatório detalhado por arquivo e identificar as linhas não cobertas.
