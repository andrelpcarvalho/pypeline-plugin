# summary
Exibe o histórico de deploys realizados pelo pypeline.

# description
Mantém um registro local (.pypeline-history.json) de cada deploy executado com timestamp, ação, baseline, Job ID, resultado e número de arquivos. Permite filtrar por tipo de ação, exibir apenas falhas e limitar o número de registros.

# examples
- Exibir os últimos 20 deploys:

  <%= config.bin %> pypeline history

- Exibir apenas falhas:

  <%= config.bin %> pypeline history --only-failures

- Filtrar por ação:

  <%= config.bin %> pypeline history --action quickdeploy

- Limpar o histórico:

  <%= config.bin %> pypeline history --clear

# flags.limit.summary
Número máximo de registros a exibir (padrão: 20).

# flags.action.summary
Filtrar por tipo de ação: run, quickdeploy, training, rollback ou all (padrão: all).

# flags.only-failures.summary
Exibe apenas os deploys que falharam.

# flags.clear.summary
Limpa todo o histórico de deploys.
