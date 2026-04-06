# summary
Valida o deploy em produção e salva o Job ID para quick deploy.

# description
Executa sf project deploy validate contra a org de produção sem efetivar o deploy. Extrai e salva o Job ID em prd_job_id.txt para uso posterior no quick deploy. Grava o output em deploy_prd_output.log.

# examples
- <%= config.bin %> pypeline validate-prd
- <%= config.bin %> pypeline validate-prd --target-org producao --wait 300

# flags.target-org.summary
Alias da org de produção (padrão: devops).

# flags.wait.summary
Minutos de espera pela validação (padrão: 240).
