# summary
Calcula o diff desde o baseline e copia os arquivos alterados para o diretório de build.

# description
Lê o baseline.txt, faz git diff, copia os arquivos alterados para a pasta de build e calcula o novo baseline (sem gravar ainda — isso acontece após o validate-prd com sucesso).

# examples
- <%= config.bin %> pypeline build
- <%= config.bin %> pypeline build --branch release-v5.0.0
- <%= config.bin %> pypeline build --dry-run

# flags.branch.summary
Branch git a fazer checkout antes do build.

# flags.dry-run.summary
Simula o build sem copiar arquivos nem executar comandos sf.
