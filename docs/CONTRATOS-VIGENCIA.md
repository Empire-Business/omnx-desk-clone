# Vigência confirmada e prorrogação

A vigência do serviço é `contratos.vigencia_fim`, uma data civil inclusiva. Ela é independente de parcelas, `vencimento`, plano financeiro e comissões. O campo legado `vencimento` mistura fim de prazo de importações Notion e primeira parcela de contratos nativos; não serve como regra automática.

## Comportamento

- Na criação pela ficha de contratos, o gestor pode informar o último dia real de serviço e a referência do acordo. É opcional; outras entradas sem data real continuam com `NULL`.
- Na ficha existente, **Confirmar vigência / Confirmar prorrogação** exige data a partir de hoje, posterior à confirmação anterior, e motivo de 8–2000 caracteres. Salvar a ficha geral não sobrescreve esses campos. O histórico registra data anterior, nova data, motivo e ator.
- Contrato pausado permanece pausado. Contrato concluído só volta a ativo quando o gestor marca expressamente a opção de reativar pelo novo acordo.
- A operação não reconfigura parcelas, valores, comissões previstas ou integração CRM. A comparação de data/status esperados impede sobrescrever uma decisão concorrente; o ator esperado é comparado com o JWT real, e tenant/permissão vêm dos helpers canônicos.
- O novo agendamento encerra somente contratos `ativo` com fim **confirmado** anterior ao dia atual em São Paulo. O último dia ainda vale. `pausado` e o marcador secundário `PAUSADO` são preservados.
- O cadastro do cliente só fica inativo se nenhum outro contrato do mesmo tenant estiver pausado ou ativo com prazo válido/sem confirmação. Nenhum cadastro antigo é varrido pela migration.
- Datas civis são exibidas sem a conversão UTC que subtraía um dia no Brasil.

## Um contrato atendendo vários clientes

Um contrato pode atender mais de um cadastro. `contratos.cliente_id` continua sendo o cliente principal e a referência financeira; `contrato_clientes` guarda somente os clientes adicionais. A view `contrato_clientes_atendidos` reúne os dois casos sem repetir o mesmo par. Não duplicar contrato, parcelas, receita ou comissões para representar outro perfil atendido.

A ficha oferece **Clientes atendidos neste contrato**. A edição mantém o principal, exige motivo e compara usuário e conjunto anterior de clientes antes de salvar. O vínculo não altera responsáveis, conversas nem permissões financeiras automaticamente. Cada cliente continua com seus grupos e análise da Íris.

A situação operacional e a proteção contra inativação pelo WhatsApp consultam principal e adicionais. A mudança de status do contrato recalcula todos os clientes atendidos, considerando outros contratos válidos ou pausados. Remover uma associação também recalcula o cadastro: sem outro contrato válido/pausado, ele pode ficar inativo. O cron existente mantém a mesma data e frequência.

Leituras de atendimento usam `_shared/contratos-clientes-atendidos.ts`, com empresa e clientes explícitos, contagem completa e projeção sem valores ou identidade do titular. As consultas financeiras permanecem por contrato/principal e com as permissões anteriores; GT3 não consulta valores. A falha na leitura de associações não é interpretada como ausência de contrato.

Migration incremental: `20261106170132_contratos_multiplos_clientes.sql`. Sem backfill. Preserva o dispatcher de ações da Íris; só os predicados de proteção da inativação passam a incluir adicionais. A aplicação em produção e a separação concreta estão descritas abaixo; os identificadores e recibos detalhados ficam no registro privado da operação.

Ao separar um atendimento antes combinado, confirmar os canais de cada cliente e refazer a memória atual a partir de suas próprias conversas. Não reutilizar o resumo combinado como contexto nem inventar uma divisão dos eventos históricos. Preservar o histórico anterior como registro da configuração antiga, com acesso administrativo; conferir snapshots, execução em andamento e contadores de IA antes da reconstrução.

## Aplicação dos clientes associados em produção

Em 06/11/2026, a migration de múltiplos clientes foi aplicada no Desk de produção. A conferência do catálogo verificou a estrutura, as políticas de RLS e os acessos previstos; a leitura do código publicado confirmou os consumidores nas nove funções atualizadas. Essas conferências não equivalem a executar os fluxos com todos os perfis: o comportamento em sessão real não administrativa não foi exercido.

Na sessão real do administrador, Flávia foi cadastrada pela interface e associada ao contrato existente. Rodrigo permanece como cliente principal; ambos têm cadastros próprios e um único contrato financeiro. A comparação antes/depois confirmou a preservação dos dados financeiros do contrato. Cada grupo foi vinculado ao respectivo cadastro nas duas origens, por identificador canônico; Octavio foi mantido. A interface e as leituras posteriores confirmaram os vínculos persistidos.

A reconstrução das memórias individuais terminou em 06/11/2026. A leitura canônica encontrou 57 mensagens de Rodrigo e 61 de Flávia, sem interseção. Antes da execução, o resumo combinado de Rodrigo foi capturado em artefato privado e limpo com comparação integral do estado e dos canais; nenhuma memória prévia de Flávia existia. A chamada anterior de Rodrigo foi transferida ao contador existente antes de remover sua contribuição atual, preservando o uso diário. O histórico anterior não foi reatribuído nem apagado.

A execução dirigida aos dois clientes retornou HTTP 200, duas análises, nenhuma falha/adiamento e duas entradas de histórico. A leitura posterior confirmou um grupo por memória, os mesmos totais de mensagens, cursores preenchidos e nenhuma reivindicação restante. Ambos ficaram neutros, com risco baixo e sem pendências identificadas nessa leitura; isso é o diagnóstico das mensagens disponíveis, não prova de que toda entrega foi concluída. O uso total registrado passou de 22 para 24 chamadas; custo registrado zero não comprova gratuidade do provedor.

## Instalação e operação

Migration: `20261106150152_contratos_vigencia_prorrogacao.sql`, gerada por `supabase migration new`. Adiciona dois campos nulos, índice parcial, RPC, validação e auditoria, ajusta os gatilhos de sincronização/financeiro e cria `contratos-vigencia-diaria` **inativo**, às 03:05 UTC (00:05 Brasília). Nenhum backfill ou fechamento é executado.

A função `concluir_contratos_vencidos()` é restrita a owner/service_role, sem parâmetros de identidade/data. Usa trava transacional e linhas bloqueadas com `SKIP LOCKED`; chamadas repetidas não fecham novamente o mesmo contrato. A alteração de `clients.ativo` evita writes sem mudança. A operação de cron e a prorrogação suprimem a ressincronização externa de CRM pelo mecanismo já existente.

A ativação do cron é uma operação separada do operador após instalação e revisão independente. Não preencher prazos legados com dados financeiros. O levantamento dos contratos antigos é material privado para revisão humana, não script de reparo autorizado. Importações e PDF continuam sem inferir a nova coluna de parcelas.

## Endpoint legado de alertas

`contratos-alerts` passa a exigir POST e `x-cron-secret` validado pelo verificador existente `wa_auto_cron_secret_confere(text)` no Vault. Nenhuma chave pública/JWT humano autoriza essa rotina global. Acesso ao verificador só por serviço/owner; sem fallback quando ele falha. Antes de publicar, o operador precisa acrescentar ao job existente o cabeçalho derivado do mesmo segredo do Vault, sem revelar/rotacionar seu valor. A flag existente `verify_jwt=false` é preservada; o gate está no handler.

A consulta usa `contrato_id` real da view e confirma tenant/estrategista/nome na tabela de contratos. Admins, gerentes e estrategista só recebem notificação se estiverem ativos e no mesmo tenant; cada insert informa `tenant_id` explicitamente. Erros de consulta/insert interrompem com resposta de falha, e contagens incluem apenas inserts com recibo. O schema observado exige tenant sem default: o insert legado o omitia e ignorava seu erro. Os filtros de inadimplência/última parcela permanecem; eles não encerram contratos. A deduplicação legada por consulta evita repetição sequencial, mas não fornece garantia de exclusão mútua entre execuções simultâneas; não foi criada nova constraint. Não acionar o job para testar.

## Verificação e recuperação proporcional

Testes locais cobrem datas civis, limites de prazo/motivo, conflito/troca de conta, persistência confirmada e falhas; DOM cobre rascunho, duplo clique, pausa e reativação explícita. SQL tem inspeção estrutural, não execução RLS. Nenhum cliente/contrato foi usado como fixture de produção.

Em 06/11/2026, a migration foi instalada no Desk de produção `<project-ref>`. A conferência do catálogo confirmou duas colunas, RPC/grants e o job inicialmente inativo. Após autorização específica do usuário, o job 54 foi ativado para 00h05 de Brasília; o readback confirmou `active=true`, agendamento `5 3 * * *` e fila vencida confirmada vazia. Nenhuma vigência estava preenchida e os 137 contratos legados permaneceram ativos, sem backfill. Não foram criados contratos de teste nem exercidas alterações contratuais humanas em produção. A primeira execução agendada futura não foi antecipada como teste.

Se surgir problema após ativação, primeiro inativar apenas o novo job e suspender a ação de vigência no frontend. Preservar colunas e histórico; não apagar auditoria nem reverter dados em lote. Antes de qualquer reparo, comparar IDs/data/status do histórico e contratos concorrentes, evitando desfazer prorrogações posteriores. Restaurar funções anteriores exige migration corretiva revisada, usando o snapshot anterior guardado pelo operador. Não remover o gate de alertas para recuperar seu agendamento: corrigir o cabeçalho do job.

## Revisão dos contratos legados: como aplicar as listas do gestor

> Atualizado em 12/11/2026

O gestor devolve a lista de revisão (`revisao-contratos-20261106*.json`, 137 contratos) **aos poucos**: cada arquivo novo é o estado acumulado da mesma lista, com mais linhas decididas. Regras para um arquivo não desatualizar o outro:

1. **O arquivo mais recente (campo `gerado_em`) vale; nunca reaplicar o anterior por cima.** Antes de qualquer escrita, ler o estado real em `contratos` e comparar com a lista. Aplicar **só a diferença** (o que a lista pede e o banco ainda não tem).
2. Decisões: `concluir` → `status='concluido'`, `status_secundario='CONCLUÍDO'` (e `vigencia_fim` só se `fim_confirmado` vier preenchido); `renovado` com `fim_confirmado` → só `vigencia_fim` + motivo; `renovado` sem data → nada muda (contrato segue ativo); `pausado` → `status='pausado'`; `pendente` → nada.
3. A lista nunca desfaz uma decisão já aplicada por voltar a `pendente`. Se o gestor **mudar de ideia** (ex.: `renovado` → `concluir`), a decisão nova vale, mas só se o contrato ainda estiver como a lista anterior o deixou (`ativo`, sem vigência). Qualquer conflito (contrato mudou por outra via, data diferente da já gravada) é parado e perguntado, não sobrescrito.
4. A aplicação é um lote único em transação, com `app.skip_venda_resync='on'`, contagem exata esperada (aborta se divergir) e ensaio prévio desfeito (`RAISE EXCEPTION` ao final). Contratos do Notion (`notion_page_id` preenchido) não recalculam comissões nem parcelas; conferir isso antes. Não usa `db push` nem migration: é dado, não schema.
5. O arquivo é material privado (nomes de clientes). Não entra no repositório; este registro guarda só contagens e impressão digital.

### Histórico de aplicações

| Data | Arquivo (`gerado_em`, sha256 início) | Aplicado |
|---|---|---|
| 09/11/2026 12:41 UTC | 09/11 09:03 UTC, `a899644f…` | 15 concluir (3 com `vigencia_fim`), 6 renovações com data, 1 pausado; 8º/9º "renovado" sem data, sem alteração; 112 pendentes |
| 12/11/2026 | 12/11 03:35 UTC, `dfed0550…` | **Diferença de 39 contratos**: todos `concluir` sem data (14 `ATIVO` + 25 `INADIMPLENTE` → `concluido`/`CONCLUÍDO`). Total após: 54 concluídos pela revisão, 6 renovações com data, 1 pausado, 57+25 ainda ativos (74 pendentes + 8 renovados) |

Conferências do lote de 12/11: todos os 39 eram contratos legados do Notion (sem recálculo de comissões; as 2 comissões `prevista` existentes foram preservadas); nenhuma vigência foi gravada; um contrato que a lista de 09/11 marcava como renovado sem data passou a `concluir` e foi tratado como mudança de decisão do gestor. Leitura posterior ao lote: 54 concluídos / 1 pausado / 82 ativos entre os 137. O encerramento pode inativar o cadastro do cliente pelo gatilho `sync_cliente_ativo_from_contratos` quando ele não tem outro contrato válido; isso é o comportamento previsto.

Reversão: não reverter em lote. Para desfazer um contrato, ler `contratos_audit_log` (a escrita aparece sem usuário, no minuto da aplicação) e restaurar `status`/`status_secundario` anteriores (`ativo` + `ATIVO` ou `INADIMPLENTE`) só desse contrato.
