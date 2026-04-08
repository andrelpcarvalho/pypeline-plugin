# summary
Configura e envia notificações via webhook (Slack, Teams, etc.) sobre o resultado dos deploys.

# description
Permite configurar uma URL de webhook para receber notificações automáticas quando um deploy é concluído (sucesso ou falha). Compatível com Slack Incoming Webhooks, Microsoft Teams e qualquer endpoint que aceite JSON POST.

A URL e o canal são salvos em .pypeline.json.

# examples
- Configurar webhook do Slack:

  <%= config.bin %> pypeline notify --set-url https://hooks.slack.com/services/T00/B00/xxx

- Definir canal:

  <%= config.bin %> pypeline notify --set-channel #deploys

- Enviar notificação de teste:

  <%= config.bin %> pypeline notify --test

- Ver configuração atual:

  <%= config.bin %> pypeline notify

- Remover webhook:

  <%= config.bin %> pypeline notify --remove

# flags.set-url.summary
URL do webhook (Slack, Teams, ou endpoint custom).

# flags.set-channel.summary
Canal de destino no Slack (ex: #deploys).

# flags.test.summary
Envia uma notificação de teste para verificar o webhook.

# flags.remove.summary
Remove a configuração do webhook.
