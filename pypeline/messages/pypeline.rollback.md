# summary
Reverte o baseline.txt para um commit anterior, permitindo re-deploy a partir de um ponto específico.

# description
Altera o baseline.txt para um commit anterior, de forma que o próximo sf pypeline run inclua todos os arquivos alterados desde esse ponto. Pode reverter N passos no histórico ou para um hash específico.

IMPORTANTE: Este comando NÃO desfaz o deploy em produção. Ele apenas altera a referência local para que o próximo build reprocesse os arquivos a partir do commit escolhido.

# examples
- Reverter 1 passo (baseline anterior ao último deploy):

  <%= config.bin %> pypeline rollback

- Reverter 3 passos atrás no histórico:

  <%= config.bin %> pypeline rollback --steps 3

- Reverter para um commit específico:

  <%= config.bin %> pypeline rollback --target-hash abc123def4

- Pular confirmação (CI/CD):

  <%= config.bin %> pypeline rollback --target-hash abc123def4 --no-prompt

# flags.target-hash.summary
Hash do commit de destino para o rollback (aceita hash parcial).

# flags.steps.summary
Número de deploys para voltar no histórico (padrão: 1).

# flags.no-prompt.summary
Pula a confirmação interativa.
