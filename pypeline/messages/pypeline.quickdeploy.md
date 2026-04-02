# summary
Quick deploy em produção usando o Job ID da última validação.

# description
Lê o Job ID gravado em prd_job_id.txt (ou recebe via --job-id) e executa sf project deploy quick. Remove o arquivo após sucesso para evitar reuso. O Job ID expira 10 horas após o validate.

# examples
- <%= config.bin %> pypeline quickdeploy
- <%= config.bin %> pypeline quickdeploy --job-id 0Af000000000001AAA
- <%= config.bin %> pypeline quickdeploy --no-prompt

# flags.target-org.summary
Alias da org de produção (padrão: devops).

# flags.job-id.summary
Job ID da validação. Se omitido, lê de prd_job_id.txt.

# flags.wait.summary
Minutos de espera pelo deploy (padrão: 240).

# flags.no-prompt.summary
Pula a confirmação interativa (útil em CI/CD).
