# summary
Gerencia as configurações do pypeline salvas em .pypeline.json.

# description
Permite visualizar, definir e remover configurações do pypeline como branch default, orgs de destino, test level e timeout. As configurações são salvas em .pypeline.json na raiz do projeto.

Chaves disponíveis:
- branch: Branch git default para o build
- prdOrg: Alias da org de produção (padrão: devops)
- trainingOrg: Alias da org de treinamento (padrão: treino)
- testLevel: Nível de testes no deploy (ex: RunLocalTests)
- waitMinutes: Timeout em minutos para deploys (padrão: 240)
- ci: Modo CI/CD — desabilita prompts interativos

# examples
- Listar todas as configurações:

  <%= config.bin %> pypeline config

- Definir a branch default:

  <%= config.bin %> pypeline config --set branch --value release-v5

- Definir a org de produção:

  <%= config.bin %> pypeline config --set prdOrg --value producao

- Consultar um valor:

  <%= config.bin %> pypeline config --get branch

- Remover uma configuração (volta ao default):

  <%= config.bin %> pypeline config --unset trainingOrg

# flags.list.summary
Lista todas as configurações atuais.

# flags.get.summary
Exibe o valor de uma chave específica.

# flags.set.summary
Define o valor de uma chave. Requer --value.

# flags.unset.summary
Remove uma chave (volta ao valor default).

# flags.value.summary
Valor a ser definido (usado com --set).
