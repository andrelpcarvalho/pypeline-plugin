# summary
Pipeline completo: build → package.xml → training (paralelo) → validate PRD.

# description
Orquestrador principal. Executa todas as etapas em sequência, com deploy em Training rodando em paralelo ao validate PRD. Em caso de falha, restaura o baseline.txt automaticamente (rollback). Ao final, grava o Job ID em prd_job_id.txt para o quick deploy.

# examples
- <%= config.bin %> pypeline run
- <%= config.bin %> pypeline run --branch release-v5.0.0
- <%= config.bin %> pypeline run --skip-training
- <%= config.bin %> pypeline run --prd-org producao --training-org homolog

# flags.branch.summary
Branch git a usar no build (sobrescreve o valor em config.ts).

# flags.skip-training.summary
Pula o deploy em Training e roda apenas o validate PRD.

# flags.dry-run.summary
Passa --dry-run para a etapa de build (sem copiar arquivos).

# flags.prd-org.summary
Alias da org de produção (padrão: devops).

# flags.training-org.summary
Alias da org de treinamento (padrão: treino).
