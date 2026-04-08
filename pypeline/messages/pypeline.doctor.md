# summary
Executa diagnóstico completo do workspace: git, sf CLI, Node.js, baseline, config, orgs e .gitignore.

# description
Verifica todos os pré-requisitos do pypeline e reporta o status de cada um com sugestões de correção. Útil para troubleshooting e onboarding de novos desenvolvedores.

Verificações realizadas:
- Repositório git válido e working tree limpa
- SF CLI instalado e versão do Node.js
- baseline.txt com commit válido
- .pypeline.json bem-formado
- sfdx-project.json presente
- .gitignore com entradas do pypeline
- Orgs padrão autenticadas (devops e treino)

# examples
- <%= config.bin %> pypeline doctor
