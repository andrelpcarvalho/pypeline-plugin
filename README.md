# pypeline

> DevOps pipeline for Salesforce, packaged as a native `sf` CLI plugin.

[![Version](https://img.shields.io/npm/v/pypeline.svg)](https://npmjs.org/package/pypeline)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/andrelpcarvalho/pypeline-plugin/blob/main/LICENSE)
[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)](#)

Automates the full Salesforce deployment cycle — git diff, package generation, PRD validation, and quick deploy — as a first-class `sf` CLI plugin. No Python scripts required.

---

## What it does

`pypeline` orchestrates the four stages of a Salesforce release in a single command:

```
git diff  →  package.xml  →  validate PRD  →  quick deploy
```

Each stage can also be run independently. If any stage fails, the `baseline.txt` is automatically rolled back.

---

## Requirements

- **Node.js** ≥ 18
- **Salesforce CLI** (`sf`) ≥ 2.x
- **Git** available on PATH

```bash
node --version   # >= 18
sf --version     # >= 2
git --version
```

---

## Installation

### From npm (recommended)

```bash
sf plugins install pypeline
```

### Local development

```bash
git clone https://github.com/andrelpcarvalho/pypeline-plugin.git
cd pypeline-plugin/pypeline
yarn install
yarn build
sf plugins link .
```

To update after code changes:

```bash
yarn build        # recompiles — the link picks up changes automatically
```

---

## Quick start

```bash
# 1. Authenticate your orgs
sf org login web --alias devops   # production
sf org login web --alias treino   # training

# 2. Set the baseline commit
git rev-parse HEAD > baseline.txt

# 3. Run the full pipeline
sf pypeline run

# 4. Quick deploy to production (after pipeline succeeds)
sf pypeline quickdeploy
```

---

## Commands

| Command | Description |
|---------|-------------|
| [`sf pypeline init`](#sf-pypeline-init) | Initialize workspace — create baseline.txt, update .gitignore, verify orgs |
| [`sf pypeline run`](#sf-pypeline-run) | Full pipeline — build → package → validate → (optional) training |
| [`sf pypeline build`](#sf-pypeline-build) | Git diff → copy changed files to build dir |
| [`sf pypeline package`](#sf-pypeline-package) | Generate `package.xml` from build dir |
| [`sf pypeline deploy training`](#sf-pypeline-deploy-training) | Deploy to training org with `RunLocalTests` |
| [`sf pypeline validate prd`](#sf-pypeline-validate-prd) | Validate deploy in production (no commit) |
| [`sf pypeline quickdeploy`](#sf-pypeline-quickdeploy) | Quick deploy using saved Job ID |
| [`sf pypeline version`](#sf-pypeline-version) | Show installed version and check for updates |

---

### `sf pypeline init`

Initializes the workspace interactively. Run this once after setting up a new project.

```bash
sf pypeline init
```

- Creates `baseline.txt` with the current HEAD commit (if not present)
- Adds pypeline entries to `.gitignore` (if missing)
- Checks that the default orgs (`devops` and `treino`) are authenticated

---

### `sf pypeline run`

Runs all four stages in sequence. Training deploy runs in parallel with PRD validation.

```bash
sf pypeline run [--branch <branch>] [--training] [--dry-run]
               [--prd-org <alias>] [--training-org <alias>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--branch, -b` | from `config.ts` | Git branch for checkout |
| `--training` | `false` | Also run deploy to training org |
| `--dry-run` | `false` | Build without copying files |
| `--prd-org` | `devops` | Production org alias |
| `--training-org` | `treino` | Training org alias |

---

### `sf pypeline build`

Calculates the git diff since `baseline.txt` and copies changed files to the build directory.

```bash
sf pypeline build [--branch <branch>] [--dry-run]
```

Output files written to your Salesforce project root:

```
build_deploy/                        ← files staged for deploy
lista_arquivos_adicionados.txt
lista_arquivos_modificados.txt
lista_arquivos_deletados.txt
lista_arquivos_naodeletados.txt
```

---

### `sf pypeline package`

Generates `package.xml` from the build directory using `sf project generate manifest`.

```bash
sf pypeline package
```

---

### `sf pypeline deploy training`

Deploys to the training org with `RunLocalTests`. Output is saved to `deploy_training_output.log`.

```bash
sf pypeline deploy training [--target-org <alias>] [--wait <minutes>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--target-org, -o` | `treino` | Training org alias |
| `--wait, -w` | `240` | Minutes to wait for result |

---

### `sf pypeline validate prd`

Validates the deploy in production without committing it. Saves the Job ID to `prd_job_id.txt`. Output is saved to `deploy_prd_output.log`.

```bash
sf pypeline validate prd [--target-org <alias>] [--wait <minutes>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--target-org, -o` | `devops` | Production org alias |
| `--wait, -w` | `240` | Minutes to wait |

---

### `sf pypeline quickdeploy`

Executes the quick deploy in production using the Job ID saved by `validate prd`. The Job ID expires **10 hours** after validation. The file is removed after a successful deploy to prevent accidental reuse.

```bash
sf pypeline quickdeploy [--job-id <id>] [--no-prompt] [--target-org <alias>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--job-id, -j` | reads from file | Override the saved Job ID |
| `--no-prompt` | `false` | Skip interactive confirmation (for CI/CD) |
| `--target-org, -o` | `devops` | Production org alias |
| `--wait, -w` | `240` | Minutes to wait |

---

### `sf pypeline version`

Displays the installed version of the plugin and warns if a newer version is available on npm.

```bash
sf pypeline version
```

Example output:

```
pypeline/1.1.2 (current)

 ›   Warning: pypeline update available from 1.1.2 to 1.2.0.
 ›   Run sf plugins update pypeline to update.
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Plugin reference](pypeline/README.md) | All commands, flags, test setup and project structure |
| [Workspace setup guide](pypeline/WORKSPACE_SETUP.md) | How to install and run the pipeline from scratch on a new machine |

---

## Configuration

The plugin resolves all paths relative to `process.cwd()`. Two files are required in your **Salesforce project root** before the first run:

**`baseline.txt`** — the git commit hash used as the diff baseline:

```bash
git rev-parse HEAD > baseline.txt
```

**Org aliases** — authenticate the orgs before running:

```bash
sf org login web --alias devops   # production (PRD)
sf org login web --alias treino   # training
```

---

## Development

```bash
# Install dependencies
yarn install

# Compile TypeScript
yarn build

# Run unit tests (49 tests, no org required)
yarn test:only

# Run with coverage report
yarn test:coverage

# Lint + type-check + unit tests
yarn test

# Link to local sf CLI
sf plugins link .
```

### Project structure

```
pypeline/
├── src/
│   ├── config.ts                 ← paths, constants, git/fs utilities
│   ├── fileUtils.ts              ← Salesforce file copy logic
│   └── commands/pypeline/
│       ├── run.ts
│       ├── build.ts
│       ├── package.ts
│       ├── quickdeploy.ts
│       ├── version.ts
│       ├── deploy/training.ts
│       └── validate/prd.ts
├── messages/                     ← oclif i18n message files
├── test/
│   ├── helpers.ts
│   ├── unit/
│   └── nuts/
└── lib/                          ← compiled output (do not edit)
```

### Adding tests

Unit tests live in `test/unit/` and use [mocha](https://mochajs.org/) + [esmock](https://github.com/iambumblehead/esmock) for ESM-compatible mocking. No org is required.

```bash
yarn test:only
```

---

## Troubleshooting

**`baseline.txt not found`**
Run `git rev-parse HEAD > baseline.txt` in your workspace directory.

**Job ID not found after validate**
The regex `0Af[0-9A-Za-z]{15}` extracts the Job ID from sf CLI output. If a future sf CLI version changes the format, update the pattern in `src/commands/pypeline/validate/prd.ts`.

**Job ID expired**
Quick deploy Job IDs expire 10 hours after validation. Re-run `sf pypeline validate prd` to generate a new one.

**Plugin not updating after code changes**
Run `yarn build` — the `sf plugins link` symlink points to the `lib/` directory, which is replaced on every build.

---

## License

MIT © [André Carvalho](https://github.com/andrelpcarvalho)
