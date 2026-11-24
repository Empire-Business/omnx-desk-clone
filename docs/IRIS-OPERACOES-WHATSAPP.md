# Operações da Íris pelo WhatsApp

Estado em 04/11/2026: publicado no Desk após autorização explícita da migration
e dos dois serviços. Jin e Sandro têm seus números vinculados aos respectivos
usuários administradores. O retorno da publicação foi enviado ao Jin no grupo.

## Ações disponíveis na implementação

| Pedido | Comportamento | Autorização |
|---|---|---|
| Conferir vários clientes | Até 20 nomes completos; situação do cadastro, contratos e responsáveis, sem valores | Carteira e permissões de consulta existentes |
| Excluir/reincluir nos avisos | Até 20 nomes; resultado por cliente; exclusão geral até reincluir | Membro identificado e administrador de Automações WhatsApp, grupo interno e pedido atual conferido |
| Atribuir estrategistas | Lista de 1–10 clientes; prévia persistida e confirmação da mesma pessoa/chat, até cinco minutos | Condições anteriores mais `clientes.atribuir/editar`; revisão e destino elegível conferidos novamente na execução |

Exclusões usam o mecanismo existente de silenciamentos (`todos/sempre`), que
afeta também os alertas ativos do painel e consultas. Os registros permanecem
em silenciados. Reincluir remove somente a exclusão geral, preservando silêncios
por tipo/prazo e resoluções. Não altera atividade do cliente nem encerra contrato.

Consultas distinguem vínculo contratual por FK de possível legado por nome;
este último só aparece para carteira total. Nome duplicado exige esclarecimento.
Cliente ativo, contrato marcado ativo e vigência real são informações diferentes;
datas de plano ou parcelas não comprovam encerramento.

## Exemplos

- `Íris, confira a situação de Cliente Alfa e Cliente Beta.`
- `Íris, exclua Cliente Alfa do relatório.`
- `Íris, reinclua Cliente Alfa no relatório.`
- `Íris, atribua o cliente Cliente Alfa ao estrategista Nome Completo.`
- Para várias atribuições, uma mensagem com `Íris, trocar estrategistas:` e uma
  linha `Nome completo do cliente | Nome do estrategista` por item.

A lista de atribuições é aplicada inteira ou nenhuma. Ausência do responsável,
onboarding sem cadastro, mais de um vínculo atual ou alteração de revisão
impedem a execução. Não há escolha silenciosa de um cadastro ou subconjunto.
Contratos, comissões e os demais tipos de responsável ficam fora da ação.

Prévias e recibos completos têm orçamento de saída próprio. Somente os códigos
e UUIDs validados do executor, nas linhas exatas de confirmação/recibo, recebem
preservação por lista permitida. Números de telefone, documentos, e-mails,
links e conteúdo livre continuam sujeitos às mesmas proteções de saída.

## Identidade, confirmação e banco

Nome exibido no grupo não comprova identidade. O número precisa estar vinculado
ao usuário ativo; perfil e permissões são revalidados. Mensagens antigas não são
retroativamente autorizadas por um vínculo posterior.

O webhook atesta a entrada original por digest. Quando outro número salvou a
mensagem primeiro, conferem-se separadamente as duas conversas, tenant,
instâncias, contatos, JID do grupo, remetente e texto. A mensagem canônica não
concede identidade. Confirmações vêm de uma nova mensagem exata, nunca de saída
do modelo, histórico, conteúdo consultado, quote ou áudio.

`20261103233619_iris_whatsapp_responsaveis.sql` amplia as propostas e cria uma
capacidade privada de execução vinculada à proposta, ao pedido e à transação.
O fluxo não falsifica `auth.uid()`, JWT ou claims; não libera DML genérico ao bot.
A RPC operacional existente continua reservada a sessões autenticadas. Guarda,
histórico e monitor de resposta usam o ator derivado do pedido confirmado.

O recurso de atribuições só é oferecido quando a RPC de capacidades confirma
que a atualização do banco está disponível. As duas ações de cadastro anteriores
continuam preservadas. A migration foi aplicada e conferida no catálogo. A
versão registrada pelo Supabase substituiu a data do nome local originalmente
revisado (`20261103220000`), com conteúdo e hash idênticos.

## Evidências e limites

Testes focados com banco em memória: origem entre números, identidade/carteira,
gramática, exclusões, proposta completa, revisões, erros e recibos. SQL revisto
estaticamente por especialista; corpos das funções anteriores comparados por
hash com produção. Isso não demonstra concorrência ou execução real da ponte.

Não foram criados bancos, containers ou ambientes de teste. A leitura do
catálogo confirmou a versão de capacidades, RLS do contexto privado e ACLs das
RPCs. `wa-agente-responder` v17 e `wa-agente-admin` v15 estão ativos; os 98
arquivos retornados coincidem com os pacotes revisados. A primeira confirmação
real de atribuição pelo WhatsApp ainda não foi observada. Evidência operacional:
`handoffs/2026-11-04-iris-jin-release.json`.
