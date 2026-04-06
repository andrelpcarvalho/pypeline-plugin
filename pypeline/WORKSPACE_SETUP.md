# Configurando o workspace pypeline do zero

Este guia parte do princípio que você já tem um **projeto Salesforce existente** e quer adicionar o `pypeline` a ele. Nenhum clone de repositório adicional é necessário — o plugin funciona a partir de qualquer pasta de projeto sf, independentemente do nome da pasta.

---

## Índice

1. [O que você vai precisar](#1-o-que-você-vai-precisar)
2. [Instalando as ferramentas base](#2-instalando-as-ferramentas-base)
3. [Instalando o plugin](#3-instalando-o-plugin)
4. [Autenticando as orgs Salesforce](#4-autenticando-as-orgs-salesforce)
5. [Estrutura do projeto e onde rodar o plugin](#5-estrutura-do-projeto-e-onde-rodar-o-plugin)
6. [Criando o baseline](#6-criando-o-baseline)
7. [Rodando o pipeline pela primeira vez](#7-rodando-o-pipeline-pela-primeira-vez)
8. [Referência rápida de comandos](#8-referência-rápida-de-comandos)
9. [Problemas comuns](#9-problemas-comuns)

---

## 1. O que você vai precisar

| Requisito | Versão mínima | Para quê |
|-----------|---------------|----------|
| Node.js | 18.x | Executa o plugin |
| Salesforce CLI (`sf`) | 2.x | Base do plugin |
| Git | qualquer | Calcula o diff dos arquivos |
| Acesso à org de PRD | — | Validação e quick deploy |
| Acesso à org de Training | — | Deploy com testes (opcional) |

---

## 2. Instalando as ferramentas base

### Node.js

Baixe o instalador LTS em [nodejs.org](https://nodejs.org) ou use um gerenciador de versões:

```bash
# Windows (winget)
winget install OpenJS.NodeJS.LTS

# macOS (homebrew)
brew install node@20

# Linux (nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20 && nvm use 20
```

Confirme:

```bash
node --version   # deve ser >= 18
```

### Salesforce CLI

```bash
npm install -g @salesforce/cli
sf --version     # deve ser >= 2
```

### Git

```bash
# Windows
winget install Git.Git

# macOS
brew install git

# Linux
sudo apt install git       # Debian/Ubuntu
sudo dnf install git       # Fedora/RHEL
```

Configure seu usuário se ainda não fez:

```bash
git config --global user.name  "Seu Nome"
git config --global user.email "seu@email.com"
```

---

## 3. Instalando o plugin

O `pypeline` é instalado diretamente no `sf` CLI — sem necessidade de clonar nenhum repositório adicional.

```bash
sf plugins install pypeline
```

Confirme:

```bash
sf plugins
sf pypeline --help
```

Para verificar se há uma versão mais recente disponível:

```bash
sf pypeline version
```

Para atualizar:

```bash
sf plugins update pypeline
```

---

## 4. Autenticando as orgs Salesforce

O pipeline precisa de duas orgs autenticadas. Os aliases padrão são `devops` (PRD) e `treino` (Training).

```bash
sf org login web --alias devops    # org de produção
sf org login web --alias treino    # org de treinamento
```

Cada comando abre o navegador para login. Após autenticar, feche a janela e volte ao terminal.

Verifique:

```bash
sf org list
```

Saída esperada:

```
 ALIAS    USERNAME                   ORG ID              CONNECTED STATUS
 ───────  ─────────────────────────  ──────────────────  ─────────────────
 devops   admin@suaempresa.com       00D...              Connected
 treino   admin@treino.com           00D...              Connected
```

> Se sua empresa usa aliases diferentes, você pode passá-los nas flags `--prd-org` e `--training-org` em qualquer comando.

---

## 5. Estrutura do projeto e onde rodar o plugin

O plugin não impõe nenhuma convenção de nome de pasta. Ele resolve todos os caminhos relativos ao diretório onde é executado (`process.cwd()`). Você só precisa estar na **raiz do seu projeto Salesforce** — seja lá qual for o nome dela.

Exemplo com a estrutura real de duas camadas:

```
workspace_sf/                             ← pasta pai (qualquer nome)
└── sforce-sfdc-bvsa-organization/        ← entre aqui para rodar o plugin
    ├── .sf/
    ├── .sfdx/
    ├── .vscode/
    ├── config/
    ├── force-app/
    │   └── main/
    │       └── default/
    │           ├── classes/
    │           ├── lwc/
    │           ├── aura/
    │           └── ...
    ├── infra/
    ├── manifest/
    ├── scripts/
    ├── test/
    ├── .eslintignore
    ├── .forceignore
    ├── .gitignore
    ├── .prettierignore
    ├── .prettierrc
    ├── Jenkins.properties
    ├── jest.config.js
    ├── package.json
    ├── README.md
    ├── sfdx-project.json
    ├── sonar-project.properties
    └── baseline.txt                      ← único arquivo novo adicionado pelo pypeline
```

**O plugin deve ser executado de dentro de `sforce-sfdc-bvsa-organization/`**, onde ficam o `sfdx-project.json` e o `force-app/`. A pasta pai (`workspace_sf/`) é ignorada.

```bash
cd workspace_sf/sforce-sfdc-bvsa-organization
sf pypeline run
```

O plugin também cria arquivos temporários nessa pasta durante a execução. Adicione-os ao `.gitignore`:

```gitignore
# pypeline — arquivos gerados pelo pipeline
build_deploy/
lista_arquivos_*.txt
prd_job_id.txt
deploy_prd_output.log
deploy_training_output.log
```

---

## 6. Criando o baseline

O `baseline.txt` define o ponto de partida do diff. O pipeline compara o estado atual do repositório com o commit registrado nesse arquivo e inclui no deploy apenas os arquivos que mudaram desde então.

**Crie o arquivo dentro de `sforce-sfdc-bvsa-organization/`:**

```bash
cd workspace_sf/sforce-sfdc-bvsa-organization
git rev-parse HEAD > baseline.txt

# Confirme o conteúdo
cat baseline.txt
# a3f1b2c9d4e5f6789012345678901234567890ab
```

### Como o baseline funciona

```
commit A  ←── baseline.txt aponta aqui
commit B     │
commit C     │  arquivos alterados nesses commits
commit D  ←── HEAD (atual)  entram no próximo deploy
```

Após um pipeline concluir com sucesso, o `baseline.txt` é atualizado automaticamente para o HEAD do momento. Na próxima execução, apenas os commits novos entram no deploy.

### Apontando para um commit específico

Se você quer incluir as alterações de um período específico, basta apontar para o commit anterior a esse período:

```bash
# Listar commits recentes
git log --oneline -10

# Usar um commit específico como baseline
echo "HASH_DO_COMMIT" > baseline.txt
```

---

## 7. Rodando o pipeline pela primeira vez

Com o plugin instalado, as orgs autenticadas e o `baseline.txt` criado, você está pronto. Execute sempre de dentro de `sforce-sfdc-bvsa-organization/`:

```bash
cd workspace_sf/sforce-sfdc-bvsa-organization
```

### Passo 1 — Simule o build (recomendado na primeira vez)

Antes de rodar de verdade, use `--dry-run` para ver quais arquivos seriam incluídos no deploy sem criar nada:

```bash
sf pypeline build --dry-run
```

O output lista os arquivos detectados no diff. Se a lista estiver correta, prossiga.

### Passo 2 — Execute o pipeline completo

```bash
sf pypeline run
```

O pipeline executa estas etapas em sequência:

```
[1/4] Build      → git diff → copia arquivos alterados para build_deploy/
[2/4] Package    → gera package.xml a partir do build_deploy/
[3/4] Training   → ignorado por padrão (use --training para habilitar)
[4/4] Validate   → valida o deploy em PRD sem efetivar
```

Se tudo passar, você verá:

```
╔══════════════════════════════════════════════════════════════╗
║  PIPELINE CONCLUÍDO COM SUCESSO                              ║
║  Job ID para quick deploy: 0Af000000000001AAA                ║
║  Execute: sf pypeline quickdeploy                            ║
╚══════════════════════════════════════════════════════════════╝
```

### Passo 3 — Execute o quick deploy

Após o pipeline concluir, o Job ID fica salvo em `prd_job_id.txt`. Use-o para efetivar o deploy sem reexecutar os testes. **O Job ID expira em 10 horas.**

```bash
sf pypeline quickdeploy
```

Uma confirmação interativa é exibida antes de executar. Para pular (automação/CI):

```bash
sf pypeline quickdeploy --no-prompt
```

---

## 8. Referência rápida de comandos

```bash
# Verificar versão instalada e updates
sf pypeline version

# Pipeline completo
sf pypeline run

# Pipeline com deploy em Training (paralelo ao validate PRD)
sf pypeline run --training

# Etapas individuais
sf pypeline build
sf pypeline package
sf pypeline deploy training
sf pypeline validate prd
sf pypeline quickdeploy

# Simular build sem copiar arquivos
sf pypeline build --dry-run

# Passar aliases de org diferentes dos padrão
sf pypeline run --prd-org producao --training-org homolog

# Passar Job ID diretamente (sem precisar do arquivo)
sf pypeline quickdeploy --job-id 0Af000000000001AAA

# Diagnóstico
sf org list                         # orgs autenticadas
cat baseline.txt                    # commit de referência atual
cat deploy_prd_output.log           # log do último validate
cat deploy_training_output.log      # log do último training
```

---

## 9. Problemas comuns

**`baseline.txt não encontrado`**

Execute `git rev-parse HEAD > baseline.txt` de dentro de `sforce-sfdc-bvsa-organization/` — o mesmo diretório onde você roda `sf pypeline run`.

**`Nenhum arquivo detectado no diff`**

O `baseline.txt` aponta para o HEAD atual — não há nada novo para incluir. Aponte para um commit anterior:

```bash
git log --oneline -10                    # veja os commits recentes
echo "HASH_DO_COMMIT_ANTERIOR" > baseline.txt
```

**`Org não autenticada`**

Execute `sf org login web --alias devops` (e `--alias treino` para a org de treinamento).

**`sf: command not found`**

Execute `npm install -g @salesforce/cli` e abra um novo terminal.

**`sf pypeline: command not found`**

Execute `sf plugins install pypeline`.

**`Job ID expirado`**

O Job ID gerado pelo validate expira em 10 horas. Execute `sf pypeline validate prd` novamente para gerar um novo.

**Plugin desatualizado**

```bash
sf pypeline version          # ver versão atual e se há update
sf plugins update pypeline   # atualizar
```
