# pypeline

Salesforce CI/CD pipeline plugin for the sf CLI. Automates build, validation, deployment, and rollback of Salesforce metadata using git diff and baseline tracking.

## Install

```bash
# Stable
sf plugins install pypeline

# Pre-release channels
sf plugins install pypeline@rc
sf plugins install pypeline@alpha
sf plugins install pypeline@beta
```

## Quick Start

```bash
# 1. Initialize workspace
sf pypeline init

# 2. Run the full pipeline (build → package → validate → ready for deploy)
sf pypeline run

# 3. Deploy to production
sf pypeline quickdeploy
```

## Commands

### Core Pipeline

| Command | Description |
|---------|-------------|
| `sf pypeline init` | Interactive setup: branch, baseline, .gitignore, org auth |
| `sf pypeline build` | Git diff from baseline, copies changed files to build dir |
| `sf pypeline package` | Generates package.xml from the build dir |
| `sf pypeline run` | Full pipeline: build → package → validate-prd (with rollback) |
| `sf pypeline validate-prd` | Validates deploy against production, saves Job ID |
| `sf pypeline training` | Deploys to training org with RunLocalTests |
| `sf pypeline quickdeploy` | Quick deploy to production using saved Job ID |
| `sf pypeline version` | Shows installed version and checks for updates |

### Observability

| Command | Description |
|---------|-------------|
| `sf pypeline status` | Workspace dashboard: baseline, pending changes, job ID, orgs |
| `sf pypeline diff` | Preview files grouped by metadata type before build |
| `sf pypeline logs` | Formatted log viewer with level filter and tail |
| `sf pypeline doctor` | 9-point health check with fix suggestions |
| `sf pypeline history` | Deploy history with filters (action, failures, limit) |

### Configuration

| Command | Description |
|---------|-------------|
| `sf pypeline config` | Manage .pypeline.json settings (get/set/unset) |
| `sf pypeline config --set prdOrg --value producao` | Set production org alias |
| `sf pypeline config --set ci --value true` | Enable CI mode (no prompts) |
| `sf pypeline notify` | Configure webhook notifications (Slack/Teams) |

### GMUD Management (alpha)

| Command | Description |
|---------|-------------|
| `sf pypeline cherry --list` | List GMUDs (via git tags) since baseline |
| `sf pypeline cherry --exclude GMUD6789` | Build excluding a specific GMUD |
| `sf pypeline cherry --include GMUD123` | Build with only specific GMUDs |
| `sf pypeline cherry-rollback --gmud GMUD6789` | Rollback a GMUD: restore modified, destroy added |

### Rollback

| Command | Description |
|---------|-------------|
| `sf pypeline rollback` | Revert baseline 1 step back |
| `sf pypeline rollback --steps 3` | Revert baseline 3 steps back |
| `sf pypeline rollback --target-hash abc123` | Revert baseline to specific commit |

---

## Pipeline Flow

```
sf pypeline init          (one-time setup)
       │
sf pypeline run           (orchestrates everything below)
       │
       ├── 1. build       (git diff baseline..HEAD → copy to build_deploy/)
       ├── 2. package     (sf project generate manifest)
       ├── 3. training    (optional, --training flag, runs in parallel)
       └── 4. validate-prd (validates against prod, saves Job ID)
       │
sf pypeline quickdeploy   (deploys using saved Job ID)
```

On failure at any step, `run` automatically rolls back baseline.txt.

---

## GMUD Workflow

For teams using GMUDs (change management) with rebase-and-merge:

### Tagging GMUDs

After a PR is merged into the release branch, tag the last commit:

```bash
# GMUD with 1 commit
git tag GMUD12345
git push origin GMUD12345

# GMUD with multiple commits (annotated tag with count)
git tag -a GMUD12345 -m "3"
git push origin GMUD12345
```

The number in the message tells cherry how many commits belong to this GMUD.

### Selective Build

```bash
# List all GMUDs since last deploy
sf pypeline cherry --list

# Build everything except GMUD6789
sf pypeline cherry --exclude GMUD6789

# Build only specific GMUDs
sf pypeline cherry --include GMUD12345 --include GMUDabcd

# Preview without building
sf pypeline cherry --exclude GMUD6789 --dry-run

# After cherry, continue normally:
sf pypeline package
sf pypeline validate-prd
sf pypeline quickdeploy
```

### GMUD Rollback

Reverts a specific GMUD: restores modified files to pre-GMUD version, destroys added files.

```bash
# Preview
sf pypeline cherry-rollback --gmud GMUD6789 --dry-run

# Generate rollback build
sf pypeline cherry-rollback --gmud GMUD6789
```

Generates a single `rollback_deploy/` folder:

```
rollback_deploy/
├── package.xml                ← restored files manifest
├── destructiveChanges.xml     ← files to remove from org
└── force-app/main/default/    ← pre-GMUD file versions
```

Deploy with one command:

```bash
sf project deploy start \
  --manifest rollback_deploy/package.xml \
  --post-destructive-changes rollback_deploy/destructiveChanges.xml \
  --target-org devops -w 240 --verbose \
  --test-level RunLocalTests
```

### Custom Prefix

If your team uses a different naming convention (e.g., CR, CHG):

```bash
sf pypeline cherry --list --prefix CR
sf pypeline cherry-rollback --gmud CR001
```

---

## Configuration

Settings are stored in `.pypeline.json` at the project root.

```bash
# View all settings
sf pypeline config

# Available keys
sf pypeline config --set branch --value main
sf pypeline config --set prdOrg --value producao
sf pypeline config --set trainingOrg --value homolog
sf pypeline config --set testLevel --value RunLocalTests
sf pypeline config --set waitMinutes --value 120
sf pypeline config --set ci --value true

# Remove a setting (reverts to default)
sf pypeline config --unset prdOrg
```

### Webhook Notifications

```bash
# Configure Slack webhook
sf pypeline notify --set-url https://hooks.slack.com/services/T00/B00/xxx
sf pypeline notify --set-channel "#deploys"
sf pypeline notify --test
sf pypeline notify --remove
```

---

## Diagnostics

```bash
# Full workspace health check
sf pypeline doctor

# Checks: git repo, git status, sf CLI, Node.js, baseline.txt,
# .pypeline.json, sfdx-project.json, .gitignore, org auth
```

```bash
# View deploy logs with filters
sf pypeline logs                          # PRD log, all levels
sf pypeline logs --target training        # Training log
sf pypeline logs --level error            # Errors only
sf pypeline logs --target prd --tail 50   # Last 50 lines
```

```bash
# Deploy history
sf pypeline history                       # Last 20 entries
sf pypeline history --only-failures       # Failed deploys only
sf pypeline history --action quickdeploy  # Filter by action
sf pypeline history --clear               # Clear history
```

---

## Release Channels

| Channel | Tag Pattern | Install | Stability |
|---------|-------------|---------|-----------|
| stable | `v1.4.0` | `sf plugins install pypeline` | Production ready |
| rc | `v1.4.0-rc.1` | `sf plugins install pypeline@rc` | Release candidate |
| alpha | `v1.4.0-alpha.1` | `sf plugins install pypeline@alpha` | Feature complete, testing |
| beta | `v1.4.0-beta.1` | `sf plugins install pypeline@beta` | Experimental |

```bash
# Check installed version
sf pypeline version

# Check available versions on npm
npm dist-tag ls pypeline
```

---

## Requirements

- Node.js >= 18
- Salesforce CLI (sf)
- Git repository with Salesforce project (sfdx-project.json)
- Authenticated orgs (`sf org login web --alias devops`)