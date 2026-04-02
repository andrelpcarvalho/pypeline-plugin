# summary
Etapa 1: build e cópia de arquivos modificados desde o baseline.

# description
Lê o baseline.txt, faz git diff, copia os arquivos alterados para a pasta de build e calcula o novo baseline (sem gravar ainda — isso acontece após o validate PRD).

# examples
- <%= config.bin %> pypeline build
- <%= config.bin %> pypeline build --branch release-v5.0.0
- <%= config.bin %> pypeline build --dry-run

# flags.branch.summary
Branch git a fazer checkout antes do build.

# flags.dry-run.summary
Simula o build sem copiar arquivos nem executar comandos sf.
