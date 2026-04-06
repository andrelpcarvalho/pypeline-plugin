# summary
Pipeline completo: build → package.xml → training (opcional) → validate-prd.

# description
Orquestrador principal. Executa todas as etapas em sequência. O deploy em Training é opt-in via --training e, quando habilitado, roda em paralelo ao validate-prd. Em caso de falha, restaura o baseline.txt automaticamente (rollback). Ao final, grava o Job ID em prd_job_id.txt para o quick deploy.

# examples
- <%= config.bin %> pypeline run
- <%= config.bin %> pypeline run --branch release-v5.0.0
- <%= config.bin %> pypeline run --training
- <%= config.bin %> pypeline run --training --prd-org producao --training-org homolog

# flags.branch.summary
Branch git a usar no build (sobrescreve o valor em config.ts).

# flags.training.summary
Habilita o deploy em Training em paralelo ao validate-prd. Desabilitado por padrão.

# flags.dry-run.summary
Passa --dry-run para a etapa de build (sem copiar arquivos).

# flags.prd-org.summary
Alias da org de produção (padrão: devops).

# flags.training-org.summary
Alias da org de treinamento (padrão: treino).
