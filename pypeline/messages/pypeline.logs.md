# summary
Exibe os logs de deploy formatados, com filtro por nível (erro, warning) e target (prd, training, quickdeploy).

# description
Lê o arquivo de log do deploy selecionado e exibe as linhas classificadas por nível: erros (vermelho), warnings (amarelo) e info. Permite filtrar apenas erros ou warnings e exibir apenas as últimas N linhas.

# examples
- <%= config.bin %> pypeline logs
- <%= config.bin %> pypeline logs --target training
- <%= config.bin %> pypeline logs --target prd --level error
- <%= config.bin %> pypeline logs --target prd --tail 50

# flags.target.summary
Qual log exibir: prd, training ou quickdeploy (padrão: prd).

# flags.level.summary
Filtrar por nível: all (tudo), error (só erros), warning (erros + warnings). Padrão: all.

# flags.tail.summary
Exibe apenas as últimas N linhas filtradas (0 = todas).
