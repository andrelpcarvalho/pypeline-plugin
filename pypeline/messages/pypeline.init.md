# summary
Inicializa o workspace do pypeline: configura branch default, cria baseline.txt, atualiza .gitignore e verifica autenticação das orgs.

# description
Executa o setup interativo do pypeline no diretório do projeto Salesforce:

- Pergunta e salva a branch default em .pypeline.json
- Cria baseline.txt com o commit HEAD atual (se não existir)
- Adiciona entradas do pypeline ao .gitignore (se ausentes)
- Verifica se as orgs padrão (devops e treino) estão autenticadas

Execute este comando uma vez ao configurar um novo workspace. Para alterar a branch default posteriormente, basta rodar sf pypeline init novamente.

# examples
- Inicializar o workspace no diretório atual:

  <%= config.bin %> <%= command.id %>
