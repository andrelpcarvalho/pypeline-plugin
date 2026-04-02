# summary
Etapa 3: deploy em Training.

# description
Executa sf project deploy start contra a org de treinamento com RunLocalTests. Grava o output em deploy_training_output.log.

# examples
- <%= config.bin %> pypeline deploy training
- <%= config.bin %> pypeline deploy training --target-org minha-org-treino --wait 120

# flags.target-org.summary
Alias da org de treinamento (padrão: treino).

# flags.wait.summary
Minutos de espera pelo resultado do deploy (padrão: 240).
