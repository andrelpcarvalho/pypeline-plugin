# summary
Rollback de GMUD: destrói adições e restaura modificações em um único deploy.

# description
Gera rollback_deploy/ com package.xml (restaurações) e destructiveChanges.xml (remoções), tudo no mesmo diretório para um único comando sf project deploy.

# examples
- <%= config.bin %> pypeline cherry-rollback --gmud GMUD6789
- <%= config.bin %> pypeline cherry-rollback --gmud GMUD6789 --dry-run

# flags.gmud.summary
Tag git da GMUD a reverter.

# flags.target-org.summary
Org de destino (padrão: devops).

# flags.wait.summary
Minutos de espera (padrão: 240).

# flags.dry-run.summary
Preview sem gerar o build.
