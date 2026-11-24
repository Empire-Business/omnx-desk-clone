# Responsáveis do cliente

Pedido de 28/10/2026: atribuir e trocar estrategistas de forma clara, com histórico
no cliente, além de manual público para leigos. Interface em publicação; migration aplicada em produção após autorização
expressa do dono. Ver o registro de aplicação abaixo.

## Contrato funcional

- Responsabilidade operacional do cliente é separada do responsável contratual.
  Adicionar/trocar/encerrar não altera contratos vigentes, encerrados ou comissões.
- Ações distintas: adicionar à equipe, trocar um vínculo selecionado e encerrar.
  Motivo de 3 a 500 caracteres, prévia, revisão esperada e confirmação explícita.
- Os vínculos atuais ficam em `client_assignments`. Encerrar remove a membresia
  atual em transação, preservando seu snapshot no histórico append-only. Isso
  evita que leitores legados baseados em EXISTS mantenham o acesso encerrado.
- Histórico registra fatos novos com data/ator do servidor, snapshots de nomes,
  motivo e origem. Não inventa início de vigência ou autoria do legado.
- Não renomear clientes, fundir registros ou atribuir carteiras reais
  automaticamente. Carteiras reais pendentes serão atribuídas pela administração responsável.

## Executor e fronteiras

RPC `client_assignment_contexto(client_id)` devolve revisão, vínculos atuais,
usuários elegíveis e primeira página de histórico. Usuários elegíveis só aparecem
para quem pode editar. Histórico paginado por revisão.

RPC `client_assignment_decidir` recebe ação/tipo/vínculo/destino/revisão esperada,
idempotência e motivo. Deriva ator e tenant da sessão; confere permissão atual,
cliente, pessoas e estado. Mutex por cliente serializa as alterações; DML legado pode adquirir o lock da linha antes do mutex e causar deadlock com rollback, exigindo retry. Não se promete ausência de abortos por concorrência.
Todo efeito e revisão são registrados no mesmo commit. Retry do mesmo pedido
não repete a mudança; payload diferente com a mesma chave é recusado.

INSERT/UPDATE/DELETE legados também passam pelas guardas/histórico. Não se
promete comparação de intenção aos escritores que não enviam revisão esperada.
Novo `ativo=false` é recusado com orientação para Encerrar; não é convertido
silenciosamente em DELETE. Campos de identidade do vínculo são imutáveis.
Encerrar vínculo antigo de usuário inativo continua permitido.

Remover as duas cascatas contratos↔atribuições impede mudanças financeiras e
concessões de carteira implícitas. O helper central de acesso deve filtrar tenant
e vínculo ativo. Inativos legados preexistentes não serão limpos automaticamente;
consultas antigas próprias ainda podem exigir revisão separada.

O hash GT3 incorpora pares cliente/revisão monotônica. Estado legado ausente
significa revisão 0 somente após leitura bem-sucedida; falha de leitura recusa o
acesso. A→B→A não reutiliza o contexto anterior. Rechecagens antes/depois da IA
permanecem; não se promete transação distribuída entre Desk e GT3.

## Manual público

Endereço planejado: `/manual`. Entrada independente sem AuthProvider, queries,
captura de console/rede do app ou dados reais. Exemplos fictícios, busca local,
índice, FAQ, glossário e impressão. Link no rodapé da plataforma. Fluxo novo
identificado como em preparação até sua publicação efetiva.

## Validação e publicação

Revisão de desenho independente delimitada concluída com condições incorporadas;
auditoria delta do conteúdo final ainda pendente. Testes focados cobriram parsing,
revisão, retries, operações e isolamento de hash com mocks, sem banco real.
102 verificações passaram em três arquivos; Deno check dos dois módulos de
carteira passou; TypeScript dos novos componentes/libs passou. O typecheck global
falha com 188 diagnósticos legados, fora dos novos arquivos. Build passou.
Checks SQL por texto não comprovam execução, RLS nem concorrência real.
Migration preparada e revisada estaticamente; execução e validação em banco não realizadas.
SQL exige revisão de nomes, dependências, permissões, cascatas e compatibilidade.

Preparar código e migration não autoriza executar a migration. A publicação do
manual pode prosseguir separadamente; aplicação do SQL exige autorização expressa
do usuário para o Desk de produção `wuzmckatbmlpkdxtfhqr` e validação compatível.
Não criar banco de teste, containers, shadow schema ou dados artificiais reais.


## Registro de aplicação

Autorização nominal recebida nesta conversa para a migration preparada como
20261028192239. Aplicada no Desk de produção wuzmckatbmlpkdxtfhqr pelo MCP;
o histórico do provedor gerou a versão 20261028194828. O arquivo foi apenas
renomeado para acompanhar essa versão, sem mudar nenhum byte do SQL auditado
(SHA256 cb5cf5ec7fd0302b351af775b33940dc4f7ab86c3495b4314bad97de71577f81).
Nenhuma outra migration foi executada. Catálogo confirmou três tabelas com RLS,
sem escrita direta por authenticated/service_role, RPCs apenas autenticadas,
helpers privados sem execução pública e remoção dos dois triggers de sincronização.
A função iris-gt3 foi atualizada da v7 para v8 com somente os dois módulos de
carteira substituídos no pacote de produção existente; verify_jwt foi preservado.
As mutações reais, RLS com dois atores e concorrência não foram exercitadas com
fixtures em produção. Não se declara validação completa de banco nem alteração
artificial de cliente para testar. O roteiro SQL permanece não executado.


## Conferência autenticada da interface publicada

PR21 integrado na main adb1c026423c29a8ff0999ccabba1982f27c9009; Vercel success.
Na sessão real do administrador, Responsáveis pelo cliente carregou vínculos e
usuários elegíveis via RPC. O formulário Trocar foi aberto, a prévia exibiu
antes/depois/motivo e preservação de contratos/comissões. A prévia foi cancelada,
sem clicar Confirmar alteração. O responsável atual permaneceu igual e o
histórico vazio informou que fatos antigos não foram reconstruídos.
Não foi feita atribuição ao destinatário usado somente como rascunho.
Esse smoke confirma leitura/autorização do administrador, renderização, prévia
e cancelamento; não comprova gravação de uma troca, RLS cruzada ou concorrência.
