# summary
Exibe uma prévia dos arquivos que seriam incluídos no próximo build, agrupados por metadata type.

# description
Calcula o diff entre o baseline.txt e o HEAD atual, identifica o metadata type de cada arquivo alterado e exibe uma tabela formatada com status (ADD/MOD/DEL), agrupada por tipo. Útil para revisar antes de executar sf pypeline run.

# examples
- <%= config.bin %> pypeline diff
- <%= config.bin %> pypeline diff --branch release-v5.0.0
- <%= config.bin %> pypeline diff --json

# flags.branch.summary
Branch para referência (informativo — o diff é sempre baseline → HEAD).
