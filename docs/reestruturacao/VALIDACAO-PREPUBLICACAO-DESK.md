# Desk — publicação e validação limitada em 06/11/2026

Estado atual: produção autorizada e publicada. Duas migrations, webhook v90,
analisador v9, ajuda v2 e cron de 15 minutos ativos. A [PR #29](https://github.com/Empire-Business/omnx-desk/pull/29) foi integrada
por squash à main `cb8676c6faca8d78854ded26c14b0a2163456795`. GitHub→Vercel: success,
deployment `6RrifcrtCKZFUZckfgoC5ruMua4t`; domínio com novo index `Dc6uMrVI`.
Menus foram observados com Bruno autenticado e uma pergunta da ajuda recebeu
resposta com IA. A resolução real de tickets e a validação funcional em banco
continuam pendentes; os limites estão nas seções finais.

As três seções de preflight abaixo são **registro histórico anterior à execução**;
seus estados de autorização, banco e publicação foram superados pelo estado final.

## Separação do trabalho — preflight histórico

- Original preservado: `/Volumes/bguzelassd/05-desenvolvimento/omnx-desk`, branch
  `feat/automacoes-wa`, HEAD `23e8b646b520dcf6737d1374e8835d3b30fb0edd`.
- Main local e GitHub conferidas em `cb78062b7db2e817cf3d58dfe924a435cbad7254`.
  Status GitHub do Vercel: success. Isso é evidência da main anterior, não desta entrega.
- Cópia gerenciada criada nesse ponto:
  `/Users/bguzela/.codex/worktrees/desk-atendimento-release/omnx-desk`.
  O sandbox não permite escrita nesse destino por padrão; a aplicação do pacote
  exige a permissão de pasta correspondente, sem mudar autenticação ou proteções.
- Merges usam preimagens da tarefa, preservando mudanças posteriores da main.
  Não copiar a pasta original inteira, não publicar sua árvore suja e não reaplicar
  migrations antigas. Nenhum commit/push foi feito.
- A main já corrigiu as seis causas da checagem focal por meios próprios.
  O overlay local `applicationTypes.ts` não deve ser levado redundantemente à main.

## Conferência remota somente de catálogo — preflight histórico

Supabase: projeto `wuzmckatbmlpkdxtfhqr`, EmpireDesk, ativo, região `sa-east-1`.
Sem branches de homologação existentes retornadas pela conexão. Não criar outra.
As duas migrations novas não constam do histórico remoto de 173 entradas.
Histórico remoto diverge dos nomes/versões locais antigos: não usar db push global.

Leituras de catálogo, sem consultar mensagens/cadastros de clientes e sem executar
RPCs de negócio, confirmaram:

- Schemas/helpers principais, extensão pgcrypto e sequência de demandas presentes;
  service_role tem USAGE nos schemas e na sequência, e EXECUTE nos helpers principais.
- Tabelas relevantes existentes têm RLS ligado. Isso não testa as policies com
  identidade de usuário nem comprova isolamento em execução.
- Triggers tenant das quatro tabelas de tipos estão ativos, assim como os de
  autoria/tenant e histórico das tabelas examinadas.
- Dois helpers privados de canal ainda não concedem EXECUTE ao worker;
  os novos arquivos SQL já preparam grants restritos necessários.
- `cliente_relacionamento_uso` não permite INSERT/UPDATE direto ao worker;
  registro deve continuar pela função de servidor, sem grant amplo para contornar.
- Job `wa-relacionamento-analisar-diario` ativo em `*/15 9-10 * * *`.
  A segunda migration prepara `*/15 * * * *`, somente para esse job existente.
  Não foi executada; nenhuma agenda foi alterada.
- Funções publicadas observadas: webhook v89 e analisador v8; ajuda `iris-ajuda`
  ausente. Não substituir fontes atuais por cópia antiga da branch de trabalho.

Uma primeira consulta de catálogo teve erro de sintaxe (42601); foi corrigida,
e a leitura pertinente passou. Nenhuma falha foi escondida ou compensada por gravação.

## Dependências e ordem propostas — preflight histórico

Aplicar exclusivamente `20261106174353_atendimento_whatsapp_tickets.sql`, depois
`20261106190452_atendimento_resolucao_natural_ia.sql`, preservando arquivos anteriores.
O novo trigger de prova de ingresso não engole erros: conferir grants/schema/helpers
antes de ativá-lo, pois uma dependência ausente pode interromper a entrada de mensagens.
A cadência muda durante a segunda migration; manter worker antigo compatível até
publicar o novo. Novo claim `_ia` separa as reivindicações antiga e nova.

Sequência proposta: webhook combinado compatível com ausência da nova RPC;
duas migrations autorizadas; analisador combinado e ajuda; frontend. Antes de
qualquer aplicação, conferir novamente o delta/versões e os gates de publicação.
Esta lista não autoriza nem realiza essas operações.

## Acesso à publicação — resultado

A conexão MCP direta do Vercel para `alto-valor/omnx-desk-lb` retornou 403.
A publicação foi concluída pelo fluxo GitHub→Vercel existente e autorizado no
repositório, sem uso de outra credencial ou acesso alternativo à API protegida.
O 403 não é bloqueio atual do frontend.

## Evidências de integração e conferência autenticada

- **186 testes em 10 arquivos** passaram na integração sobre main. Após correção
  para adiar excesso de metadados sem apagar pedidos, **78 testes em 2 arquivos**
  passaram, incluindo um cenário novo. Não somar as rodadas.
- Checagem de tipos das **19 entradas UI**, Deno e build passaram. Não se trata de
  aprovação da antiga checagem global inteira.
- Bruno administrador autenticado observou os menus novos. Nova demanda foi
  aberta e cancelada sem criar registro; opções não oferecem Reels/Carrossel/Stories.
- Viewport **390×844 simulada**, com Contratos visível; simulação encerrada e
  sidebar restaurada. Não comprova comportamento em aparelhos físicos.
- Ajuda **v2** respondeu com IA a **uma única pergunta**: “Onde encontro os contratos
  de um cliente?”. Retornou guia, fontes e atalhos; a pergunta não continha dados
  de clientes. Isso não é avaliação irrestrita nem teste do classificador de tickets.

## Execução autorizada e disponibilidade observada

Duas migrations aplicadas, versões remotas `20261106195505` e `20261106195522`.
Webhook **v90**, analisador **v9** e ajuda **v2** ativos. Fontes retornadas iguais
aos candidatos revisados (**15/20/5**, respectivamente). Catálogo: três tabelas
novas com RLS, sem SELECT anon/auth; oito RPCs restritas ao worker; recibos sem
UPDATE/DELETE/TRUNCATE; cinco triggers ativos; cron `*/15 * * * *` ativo.

Na janela **19:55–20:04 UTC**, **13 execuções do webhook v90** e **1 do analisador
v9** tiveram HTTP 200. A evidência é de disponibilidade nessa janela; não comprova
que um pedido real foi criado, resolvido ou reaberto corretamente. A execução das
migrations e a leitura do catálogo não validam SQL/RLS/concorrência em execução.

## Validações ainda pendentes

- Resolução e reabertura reais de pedido WhatsApp e semântica do classificador.
- SQL/RLS/concorrência, negativos entre empresas e efeitos/custos do uso contínuo.
- Outros perfis, aparelhos físicos e estudo de uso com a operação.
- Gravação dos tutoriais; somente o plano foi preparado.

O relatório para leigos é `../relatorios/2026-11-06-reorganizacao-desk.html`.
Estado/hashes: `../handoffs/2026-11-06-desk-release.json`.
O handoff de continuidade registra a etapa anterior à publicação.
## Acesso à publicação — 403 anterior ao resultado

Vercel identificado: equipe `alto-valor`, projeto `omnx-desk-lb`.
A conexão retornou 403 por falta de acesso à equipe. Fluxo oficial de consentimento
foi apresentado ao dono; não houve concessão confirmada. O link tem duração curta;
gerar outro somente se necessário. Não contornar por outra conta/CLI nem alterar MCPs.

## Evidências locais anteriores à publicação

- 129 testes focados, Deno e build da correção natural passaram no original antes
  desta integração. Seus logs e recibos estão no handoff; não comprovam o merge novo.
- As seis causas da checagem focal local foram corrigidas e a repetição pertinente
  passou. A análise global histórica de 188 diagnósticos não foi repetida inteira.
- Revisão estática independente do delta de tipos não encontrou redução de acesso.
  Os recibos anteriores de segurança cobrem somente os snapshots neles registrados.
- Integração sobre main requer verificações pertinentes e nova conferência de seu
  snapshot. Modelo real, fluxo autenticado, SQL/RLS/concorrência e efeitos da agenda
  seguem pendentes. Nenhuma mensagem ou chamada real à IA foi enviada nesta tarefa.

Migration preparada e revisada estaticamente; execução e validação em banco não realizadas.

O relatório para leigos é `../relatorios/2026-11-06-reorganizacao-desk.html`.
Continuidade: `../handoffs/2026-11-06-resolucao-automatica-continuidade.md`.

com autorização própria do repositório; não usa credencial ou API Vercel alternativa.
