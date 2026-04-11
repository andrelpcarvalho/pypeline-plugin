# summary
Build seletivo por GMUD: inclui ou exclui GMUDs específicas do deploy usando tags git.

# description
Detecta tags git com prefixo GMUD (ex: GMUD12345) entre o baseline e HEAD, identifica os arquivos de cada GMUD e permite construir o pacote incluindo ou excluindo GMUDs específicas.

Projetado para fluxos com rebase-and-merge + delete branch, onde não existem merge commits. Cada GMUD é identificada por uma tag git criada no último commit do PR antes (ou após) o merge.

Como criar tags de GMUD:
  git tag GMUD12345                    (no commit atual)
  git tag GMUD12345 <commit-hash>      (em um commit específico)
  git push origin GMUD12345            (enviar para o remote)

Modos de operação:
- --list: apenas lista as GMUDs sem gerar build
- --exclude GMUD6789: gera build com TUDO exceto a GMUD6789
- --include GMUD12345 --include GMUDabcd: gera build apenas com essas
- sem flags: inclui tudo (mesmo comportamento do build normal)

Se um arquivo pertence a uma GMUD incluída E uma excluída, a inclusão prevalece.

Após o build seletivo, execute sf pypeline package e sf pypeline validate-prd normalmente.

# examples
- Listar todas as GMUDs desde o baseline:

  <%= config.bin %> pypeline cherry --list

- Gerar build excluindo uma GMUD (rollback seletivo):

  <%= config.bin %> pypeline cherry --exclude GMUD6789

- Gerar build excluindo múltiplas GMUDs:

  <%= config.bin %> pypeline cherry --exclude GMUD6789 --exclude GMUDxyz

- Gerar build incluindo apenas GMUDs específicas:

  <%= config.bin %> pypeline cherry --include GMUD12345 --include GMUDabcd

- Preview sem executar:

  <%= config.bin %> pypeline cherry --exclude GMUD6789 --dry-run

- Usar prefixo customizado (ex: CR ao invés de GMUD):

  <%= config.bin %> pypeline cherry --list --prefix CR

# flags.exclude.summary
ID da GMUD a excluir do build (pode repetir para excluir várias).

# flags.include.summary
ID da GMUD a incluir no build (pode repetir para incluir várias).

# flags.list.summary
Apenas lista as GMUDs encontradas sem gerar build.

# flags.prefix.summary
Prefixo das tags de GMUD (padrão: GMUD). Ex: --prefix CR para tags como CR12345.

# flags.branch.summary
Branch de referência.

# flags.dry-run.summary
Mostra o que seria incluído/excluído sem gerar o build.
