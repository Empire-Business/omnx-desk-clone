# MUDANÇAS — Changelog do omnx-desk

> Registro cronológico (mais recente no topo) das entregas relevantes.
> Atualizado em: 22/11/2026 às 21h05 BRT

## 2026-11-22 — Pesquisas NPS da equipe em `/relatorios/pesquisas` (plano #241, fase A, item 17)

- **O que é:** tela da equipe para as campanhas de NPS, no bloco Análise do menu, logo depois de Relatórios.
  `/relatorios/pesquisas` lista as campanhas (`nps_surveys`) com cliente, data, situação e última nota, e mostra o
  placar NPS de todas as respostas (NPS, zona, promotores 9–10, neutros 7–8, detratores 0–6, média). Criar campanha
  abre um cartão com busca de cliente e usa `useCreateSurvey`. `/relatorios/pesquisas/:id` mostra o placar da
  campanha e as respostas (`nps_responses`) com nota, faixa, comentário, cliente e data.
- **Quem pode:** menu e página só para admin, a mesma trava do relatório NPS de `/relatorios`
  (`TRAVAS_DE_PAGINA.pesquisas` = `TRAVAS_DE_PAGINA.relatorios`). Criar campanha só aparece para admin, a regra da
  RLS `admin_manage_nps_surveys`. Nenhuma migration, nenhuma mudança de RLS.
- **Sem envio:** nada vai pelo WhatsApp (regra de cadência). Copiar link copia `/portal/nps/:surveyId`; com o portal
  do cliente desligado (arquivado hoje), o botão fica desligado e a tela avisa.
- **Situação da campanha** vem das respostas, não de `respondido_em`: o cliente que responde não tem permissão de
  atualizar `nps_surveys`, então essa data pode ficar vazia mesmo com resposta gravada (lacuna de RLS já existente,
  fora deste item).
- O relatório NPS de `/relatorios` não mudou. `useNps` ganhou `useCampanhasNps` (campanhas com cliente e respostas
  numa consulta só). A Íris explica a tela na seção Pesquisas NPS do manual.

---

## 2026-11-22 — Aulas da equipe em `/aulas` (plano #241, fase A, item 13)

- **O que é:** tela da equipe para montar trilha (trilha → módulos → aulas) e estudar com progresso, no bloco
  Agenda do menu, logo depois de Agenda. `/aulas` lista as trilhas `tipo = 'interno'` com módulos, aulas, minutos
  e "X de Y" concluídas; `/aulas/:id` mostra os módulos, abre a aula (`?aula=`; vídeo do YouTube/Vimeo no player,
  outro vídeo no `<video>`, PDF em quadro, link em botão, texto como texto puro) e tem Marcar como concluída e
  Próxima. Fluxo e aparência seguem as coleções e aulas do OMNX Clients.
- **Quem pode:** menu e página para admin, gerente, estrategista e atendimento — a mesma lista da RLS
  `team_read_internal_paths`. Os botões Nova trilha, Novo módulo e Nova aula só aparecem para admin, a mesma regra
  das políticas `admin_manage_*`. Nenhuma migration, nenhuma mudança de RLS.
- **Limite conhecido:** o progresso exibido é o da própria pessoa (`own_progress`). Ver o progresso de cada pessoa
  da equipe exigiria uma política de leitura nova para admin — fica para decisão.
- **Portal:** `/portal/trilhas` não mudou. `useCreateModule`/`useCreateLesson` agora invalidam `trilhas` inteiro
  (lista e detalhe), para o cartão atualizar a contagem.
- **Ajustes da revisão da Vera:** vídeo não listado do Vimeo mantém o hash (`?h=` ou `vimeo.com/ID/HASH`) e abre
  em `player.vimeo.com/video/ID?h=HASH`; YouTube `/live/ID` entra junto com `watch`, `youtu.be`, `embed` e `shorts`.
  Vídeo e PDF passam a exigir `https://` no formulário (em `http` o quadro fica em branco, bloqueado como conteúdo
  misto); link continua aceitando `http`, porque abre em outra aba. Link de coleção do Vimeo
  (`vimeo.com/showcase/N` ou `album/N`, sem `/video/ID`) não vira player: antes tocava o id da coleção.

---

## 2026-11-20 — Lote de tickets: "aguardando equipe" fica fora e o cartão não perde quem a pessoa desmarcou

- **Resolver em lote** pula os tickets em `aguardando_equipe` (o cliente mandou a última mensagem): eles não entram
  no plano e o cartão avisa. Agora o mesmo vale quando a pessoa marca todo mundo pelo "selecionar todos deste filtro"
  — o padrão da regra é aplicado na abertura do cartão (`marcadosNoCartao`), e o que ela incluir a um a um continua
  valendo.
- **Prioridade e responsável em lote** ganharam a terceira ação (`atribuir`), que não aplica a regra de estado: dá
  para mudar prioridade ou responsável de ticket já resolvido. `Resolver` e `Reabrir` seguem restritos.
- O cartão lista os candidatos (não só os marcados): desmarcar um ticket errado não faz a linha desaparecer, e dá
  para marcar de novo sem cancelar e abrir o cartão outra vez. A contagem usa o que está marcado agora.
- **Desfazer** só aparece em resolver/reabrir, devolve a etapa de cada ticket e conta as falhas de RLS com
  `.select('id')`; a sugestão da Íris que o gatilho limpou ao mudar de etapa não volta (igual ao fluxo de um ticket
  só). O aviso sem desfazer fecha sozinho em 6 s, em vez de ficar por cima da barra do lote.
- **Permissão e foco**: `podeResolver`/`podeReabrir` desligam a ação na barra e a linha que a ação não alcança
  (`aria-disabled`); o botão da Íris, a barra e o cartão respeitam `podeEditar`; a barra do lote só aparece com algo
  marcado; a seleção é podada ao trocar de filtro; e nenhum `catch` mostra a mensagem crua do Supabase.

---

## 2026-11-20 — Dois vazamentos para `anon`: ids de outros tenants e `department_instance_assignments`

- **O caso (achado da revisão da Vera):** `private.chat_contatos_restritos_ids()` e
  `private.chat_conversas_restritas_ids()` têm EXECUTE para `anon` e, **sem sessão**, devolviam os ids de contatos
  e conversas restritas de **todas as empresas** — `get_user_tenant_id()` é nulo sem sessão e a condição era
  `t.tid IS NULL OR c.tenant_id = t.tid`. E `public.department_instance_assignments` tinha
  `department_instance_assignments_select` como `PERMISSIVE FOR SELECT TO public USING (true)`: `anon` lia a
  tabela inteira (a política restritiva da fase B é `TO authenticated` e não o alcança).
- **O conserto (`20261120150000`):** as duas funções passam a exigir empresa na sessão (`t.tid IS NOT NULL AND
  c.tenant_id = t.tid`); sem sessão devolvem `'{}'`. Com sessão de uma empresa resolvida o resultado é o mesmo de
  antes. Quem tem sessão mas **sem empresa resolvida** (tenant nulo) é a única diferença: recebe `'{}'` em vez dos
  ids, e continua vendo zero linha em `chat_contacts` e `chat_conversations`, porque as políticas de lá passam por
  `auth.uid()` — o que ela deixa de receber é id de empresa alheia. A política de SELECT da tabela vira
  `TO authenticated` com `tenant_id = get_user_tenant_id()` — aí a visão de quem tem sessão não muda mesmo sem
  empresa resolvida, porque a restritiva da fase B já limitava pela mesma expressão. O DROP/CREATE POLICY roda
  dentro de um `BEGIN` com `SET LOCAL lock_timeout = '5s'` (mesmo padrão da `20261026255000`): com uma consulta
  longa na tabela, a migração desiste em 5 s em vez de enfileirar as leituras atrás do AccessExclusiveLock.
- **O que não mudou de propósito:** o EXECUTE de `anon` nessas funções **não** foi revogado (decisão do Bruno,
  pendente); o `CREATE OR REPLACE` não mexe em ACL. As políticas permissivas de INSERT e DELETE da tabela continuam
  `TO public`, mas exigem `auth.uid()` (`users.perfil IN ('admin','gerente')`), então sem sessão não passam.
- **Prova:** `supabase/tests/banco-do-zero/verificar-anon-restritos.sql` (casos: sem sessão as duas devolvem vazio
  mesmo com dado de duas empresas; com sessão cada uma devolve só a sua; `anon` não lê a tabela, que é gravada com
  uma atribuição por empresa antes do teste — tabela vazia daria zero linha também num banco quebrado) e o contrato
  estático em `supabase/functions/_shared/anon-restritos-migration.test.ts`. Rodado contra o banco **sem** o
  conserto, o verificador falha em "1: sem sessão, devolvido `{c1…,c2…}`" — os ids das duas empresas. Com as
  linhas gravadas, o caso da tabela também falha no banco quebrado ("anon lê 2 linha(s)"); sem elas passaria calado.
  Idempotente: aplicada duas vezes seguidas no banco do ensaio, 0 erro e ~0,5 s cada.

## 2026-11-20 — RPC `desk_mfa_situacao()`: EXECUTE de volta para authenticated e service_role

- **O caso (produção do EmpireDesk, SaaS):** depois da `20261119180100`, a função ficou com o EXECUTE que o
  Postgres dá de fábrica a PUBLIC — na prática, `anon` podia chamá-la. A `20261109140000`, que fecha o acesso,
  não roda no SaaS (depende da licença HTAI) e o `CREATE OR REPLACE` da 180100 não mexe em ACL.
- **Não vazava nada:** para `anon` ela devolve `{"aal":"aal1","exigida":false,"pendente":false,
  "superadmin":false}`, o mesmo que um visitante já vê pelas outras telas; o grant estava errado de qualquer forma.
- **O conserto:** a `20261120140000` fecha de novo (`REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO
  authenticated, service_role`), idempotente e com guarda para o caso de a função não existir; e a `20261119180100`
  repete o fecho depois dos dois `CREATE OR REPLACE`, para instalação nova sair certa nos dois caminhos.
- **Prova:** `supabase/tests/banco-do-zero/verificar-mfa-grants.sql` e `verificar-saas-mfa-grants.sql` leem o ACL
  (`pg_proc.proacl`) e o `has_function_privilege`. O ensaio com licença (209 arquivos) e o do SaaS sem licença
  (207) passam nos dois; no banco SaaS montado sem o conserto, o verificador novo falha em "anon não pode executar".

## 2026-11-20 — SETUP_COMPLETE.sql regerado: aplica num projeto vazio

- O `scripts/dump-schema.mjs` só despejava o schema `public`, e o app usa `private.*` em políticas e funções desde
  as migrações de atendimento: o arquivo gerado dava 28 erros "schema private does not exist" num banco vazio, e
  mais 1 porque as CHECK constraints saíam antes das funções (`wa_base_url_permitida`). O `SETUP_COMPLETE.sql` do
  repositório era de 19/05/2026, de antes de tudo isso.
- O gerador agora despeja `public` e `private`, cria os dois schemas e ordena: tabelas, PK/única, FK, **funções**,
  **CHECK**, índices, views, gatilhos, RLS, políticas e grants. As tabelas vêm de `pg_attribute` + `format_type`
  (domínio, enum, array, identity e default) e as views de `pg_get_viewdef`. Também passou a criar as extensões no
  schema delas (`with schema extensions`: sem isso o `unaccent` caía em `public` e as chamadas
  `extensions.unaccent(...)` quebravam) e a repetir o `execute` real das funções — as migrações liberam só algumas
  para `anon`/`authenticated` e tiram outras de `PUBLIC` (o `handle_new_user`, por exemplo), e sem isso o arquivo
  nascia com todas abertas.
- O arquivo regerado (16814 linhas) sai do **estado da main depois do merge `fe8ac07`** (#55, #49, #48 e #57, mais
  o #59 e o #60),
  com o `handle_new_user` que lê `raw_app_meta_data`, a trava do primeiro acesso do #48 e a marca somada com
  `COALESCE` do #57. Aplica com `ON_ERROR_STOP=1` num banco vazio com a imitação do Supabase: 0 erros e os mesmos
  números do banco de origem (169 tabelas, 280 funções do app, 399 políticas, 521 índices, 238 gatilhos, 5 views,
  3 enums).
- O que o gerador perdia nas relações, agora vai junto: as **reloptions das views** (`security_invoker=true` nas
  5 — sem elas a view rodava como o dono e, como `anon`, `users_legacy` devolvia nome e e-mail de todo mundo), o
  **replica identity** (`FULL` em `chat_conversations` e `chat_messages`, de que o Realtime depende), o **dono das
  sequences** (`OWNED BY`; o `api_request_log_id_seq` ia órfão) e a **ACL de relação e de coluna**: o default do
  Supabase libera toda relação nova para `anon`/`authenticated`, então um `revoke` de migração se perdia no arquivo
  (`contrato_clientes_atendidos` ficava com `anon`) e os grants por coluna (o `insert` de `wa_agente_grupos` e de
  `equipe_identidades`, que o `authenticated` só tem coluna a coluna) não existiam.
- O comparador (`supabase/tests/banco-do-zero/comparar-setup.mjs`) passou a conferir essas quatro coisas além do que
  já conferia: **9860 objetos canônicos iguais** entre o banco das migrações e o banco montado pelo arquivo. As
  únicas diferenças são 5 CHECK que o Postgres imprime com parênteses diferentes (`BETWEEN` vira `>=` e `<=` —
  mesma expressão), e o comparador as lista uma a uma para quem revisar. Prova do `security_invoker`: como `anon`,
  no banco montado pelo arquivo, `select from users_legacy` devolve **0 linhas** (no arquivo anterior devolvia o
  nome e o e-mail da conta).
- O `MAINTAIN` do PG17 não existia repetido 553 vezes sem trava: num Supabase ainda em PG15 o arquivo morria no
  primeiro `GRANT` com `unrecognized privilege type "maintain"`. O gerador agora tira o `MAINTAIN` dos `GRANT`
  normais e o concede num único bloco guardado por `current_setting('server_version_num')::int >= 170000`, então o
  mesmo arquivo serve nos dois: em PG17 dá as 553 concessões de `MAINTAIN` e em PG15 não dá nenhuma, porque lá o
  privilégio não existe. Aplicado num Postgres 15.20 com a imitação do Supabase: 0 erros e as mesmas contagens do
  PG17 (169 tabelas, 280 funções, 399 políticas, 521 índices, 238 gatilhos, 5 views, 3 enums). `MAINTAIN` no PG15
  não é perda: não há o que conceder.
- O arquivo regerado tem o **schema e as permissões**, não os dados: a empresa principal (`is_master`), o
  organograma de exemplo, as colunas do kanban, os departamentos de chat e os catálogos que as telas leem
  (`app_modules`, `permissoes_app`, `app_settings`) continuam fora dele, porque vêm do seed das migrações.
  Instalação nova é pelas migrações; o `SETUP.md` diz isso na seção 2 e avisa o que fica faltando em quem usar só
  o arquivo (as telas de catálogo abrem vazias e não há empresa principal).

---

## 2026-11-19 — Conta provisionada em instalação nova entra na empresa do servidor

- **O caso (achado da revisão do #49):** numa instalação sem nenhuma administradora, a conta que o
  `provision-tenant` (ou o `admin-create-user`) cria antes do primeiro login caía no primeiro acesso: o gatilho
  imediato a punha na empresa principal e renomeava a principal. O gatilho adiado via a linha já criada e saía sem
  olhar o `app_metadata`; depois o `provision-tenant` movia só `users.tenant_id` — papéis, perfil e cargos ficavam
  na principal, a empresa nova ficava vazia e a resposta era de sucesso.
- **A correção:** `desk_conferir_conta_nova` lê o `app_metadata` antes de desistir. Com perfil e empresa do
  servidor, o servidor vale: se a conta já está na empresa certa, só completa o que faltar; se está em outra e
  nasceu do primeiro acesso **nesta mesma transação** (marcado com `set_config` local), desfaz o vínculo que o
  primeiro acesso criou, devolve nome e slug à empresa principal (e apaga a empresa que ele criou, se foi o caso)
  e refaz o vínculo na empresa do servidor; se está em outra e não veio daqui, **recusa** ("conta já vinculada a
  outra empresa"). Conta que já existia nunca é movida.
- **Prova:** `supabase/tests/banco-do-zero/verificar-primeiro-acesso-provisionado.sql` — falha na versão anterior
  (a dona ficava na principal com resposta de sucesso) e passa agora, junto dos outros dois verificadores.
- **Conferência da brecha:** `docs/CONFERENCIA-BRECHA-CADASTRO.sql` versiona a consulta que ficou no corpo do #49,
  agora comparando `perfil` e `tenant_id` **separadamente** — quem forjou só o `tenant_id` deixava de aparecer.
- **Cópia fiel, com dois ajustes:** o `handle_new_user` de `20261119180000` é o de `20261119150000` mais a
  decisão da primeira conta (a trava consultiva do #48) e a marca do gatilho adiado corrigida no #57 (`v_gravado`
  fora do `RETURNING` e `COALESCE` ao somar), para que um UPDATE sem linha não zere a marca; o teste
  `_shared/ensaio-1911-migrations.test.ts` desfaz os dois ajustes e compara o resto byte a byte.
- **`supabase/SETUP_COMPLETE.sql`:** não foi regerado nesta entrega (o `scripts/dump-schema.mjs` só despejava o
  schema `public`, e o arquivo gerado não aplica num banco vazio); a regeneração, com os schemas `public` e
  `private` e as permissões, sai no PR #58, que entra depois deste e do #48.

---

---

## 2026-11-19 — API REST v2: rotas deixam de responder 404

- No teste com chave real de 19/11, toda rota da `chat-api-v2` respondia 404: o Edge Runtime do Supabase entrega o
  `pathname` como `/chat-api-v2/...`, sem `/functions/v1`, e o código só tirava o prefixo completo.
- A leitura do caminho foi para `caminhoDaRota()` em `_shared/chat-api-v2-regras.ts`, que aceita os dois formatos.
  Teste novo em `chat-api-v2-regras.test.ts` (falha no código antigo, passa no novo).
- A `chat-api` original não muda (tem o mesmo padrão, mas pode ter usuários externos; fica como está).
  Publicação: só a `chat-api-v2`.

---

## 2026-11-19 — Licença também na API v2 e no MCP: instalação sem licença recebe 402

- A `chat-api-v2` e o `desk-mcp` (portas de API que entraram no PR #46) não passavam pela trava de licença: com a
  licença negada, elas continuavam respondendo. Agora as duas chamam `travaDeLicenca()` de `_shared/htai-licenca.ts`
  na entrada do handler, antes de ler a chave — a recusa sai **402** com o mesmo corpo por motivo das outras funções
  (`{"error":"licenca_inativa","motivo":…,"mensagem":…}`), e não mais 401/200.
- Nada muda no SaaS hospedado: fora do escopo instalação (`HTAI_ENTITLEMENTS_MODE` ausente ou `off`) o atalho devolve
  `null` sem consultar nada — o comportamento da nuvem da empresa fica idêntico.
- Novo teste `_shared/htai-licenca-api-v2-mcp.test.ts` prende a posição da trava antes da leitura da chave, para uma
  refatoração futura não devolver 401 no lugar de 402. Os dois casos que falhavam em `htai-licenca-cobertura.test.ts`
  passam a passar.

---

## 2026-11-19 — Ensaio real do app instalado (0.2.1): primeira conta pela tela, superadmin rebaixado e aviso da licença

Três defeitos achados no ensaio real do Desk 0.2.1 numa conta de teste. Nenhuma migração antiga
foi editada; as três novas são idempotentes.

- **D3 (alta) — a tela de entrada não tinha como criar a primeira conta.** O roteiro de
  instalação manda "clicar em criar conta", mas o login só tinha e-mail, senha e código.
  - Botão **"Criar a primeira conta"** na tela de entrada (`LoginPage`,
    `components/auth/PrimeiroAcessoForm.tsx`, `lib/primeiroAcesso.ts`): nome, nome da empresa,
    e-mail e senha (duas vezes, 8+ caracteres). Só aparece enquanto o app **não tem nenhuma
    administradora**, e quem diz isso é o banco: `desk_primeiro_acesso_aberto()` (anônima,
    devolve só um booleano; migração `20261119180000`). A tela confere de novo antes de cadastrar.
    Com confirmação de e-mail ligada (app instalado), mostra "enviamos um link"; o link volta
    para o início do app.
  - O cadastro manda só `nome` e `empresa`; o `handle_new_user` faz da primeira conta a
    administradora da empresa principal, com o nome da empresa informado (como já fazia).
  - `handle_new_user` passa a decidir a "primeira conta" pela mesma função e, com a porta
    aberta, pega uma **trava consultiva** e confere de novo. Antes, dois cadastros ao mesmo
    tempo num app recém-instalado viravam **duas administradoras** e o segundo trocava o nome
    da empresa (reproduzido na main). Agora o segundo espera o primeiro e, como já há administradora,
    é recusado (regra de `20261119150000`).
  - Regra mais estrita: perfil `admin` sem papel em `user_roles` também conta como
    administradora (com a regra antiga, um app sem nenhum papel `admin` reabria o primeiro
    acesso e o próximo cadastro virava administradora de uma empresa nova).
  - A pergunta entra em `htai_licenca_rpcs_livres()` (a tela de entrada pergunta mesmo com a
    licença negada).
  - **Produção da empresa:** sempre existe administradora, a função responde `false`, o botão
    não aparece e o `handle_new_user` segue o caminho de hoje sem pedir a trava (provado no
    ensaio do banco com um cadastro igual ao das funções `admin-create-user`/`provision-tenant`).
- **D4 (média) — rebaixar pela tela de Colaboradores não tirava a superadministração.** A tela
  muda só `users.perfil`; `is_master_admin()` e `desk_mfa_situacao()` aceitavam também
  `user_roles.role = 'admin'`. A rebaixada seguia criando empresas, mas não exportava
  (`htai-exportar` usa `is_admin()`). Migração `20261119180100`: as duas funções usam só
  `u.perfil = 'admin'`, a mesma régua de `is_admin()`, `has_permissao()`, das políticas e da
  exportação. O segundo fator do app instalado continua exigido.
  - **Por que não a alternativa (a tela limpar `user_roles` ao rebaixar):** seriam duas gravações
    separadas feitas pelo navegador (uma pode falhar e a outra não); só valeria para a tela
    (SQL, funções e as linhas que já divergem continuariam erradas); e, sem nenhum papel `admin`
    sobrando, a porta do primeiro acesso poderia se reabrir. A regra no servidor vale para
    qualquer caminho e falha fechada.
  - **Antes de levar à produção da empresa**, ver só lendo quem perderia a superadministração
    (é quem já foi rebaixado):
    `select u.email from public.users u join public.tenants t on t.id = u.tenant_id and t.is_master join public.user_roles ur on ur.user_id = u.id where ur.role = 'admin' and u.perfil <> 'admin';`
- **Aviso da licença (baixa).** Revogada ou suspensa aparecia como "venceu… Renove". Agora um
  texto por motivo (mesmo critério do Sell, omnx-sell#64): não ativada, vencida (renove),
  suspensa e revogada (fale com o suporte da HTAI) e sem confirmação além da folga (volta
  sozinho quando a conexão voltar). Mesmos textos no banco (`20261119180200`, só o campo
  `mensagem`), nas funções (`_shared/htai-licenca-core.ts`) e na tela (`src/lib/licenca.ts`, que
  usa o motivo e por isso já mostra certo antes da migração). Na produção (modo off) nada muda.
- **Testes:** `src/lib/primeiroAcesso.test.tsx`, `src/lib/licenca.test.tsx`,
  `_shared/htai-licenca-core.test.ts`, `_shared/ensaio-1911-migrations.test.ts` (o
  `handle_new_user` é o de `20261119150000` com só a decisão da primeira conta e a marca do gatilho adiado, e a
  situação da licença é fiel à de `20261109130000`); no banco do ensaio,
  `verificar-primeiro-acesso.sql`, `verificar-superadmin.sql`, `verificar-licenca-aviso.sql` e
  `corrida-primeiro-acesso.mjs` (duas conexões ao mesmo tempo). Os três testes de banco do D3/D4
  e a corrida falham na main e passam com a correção.
- **Depende da entrega "conta nova só recebe papel e empresa do servidor" (abaixo, `20261119150000`):**
  o `handle_new_user` desta entrega é aquele, mais a regra e a trava do primeiro acesso. Com ela, depois
  da primeira conta o banco recusa qualquer cadastro sem papel e empresa do servidor; o instalador
  continua fechando o cadastro público no passo `primeiro-acesso`.

---

## 2026-11-19 — Segurança: conta nova só recebe papel e empresa do servidor

- **A brecha:** o `handle_new_user` lia `perfil` e `tenant_id` dos dados da conta (`raw_user_meta_data`), que
  quem se cadastra escreve. Com o cadastro público do Supabase Auth ligado, um anônimo virava administradora (ou
  qualquer perfil) da empresa que escolhesse; sem empresa, caía na única empresa da instalação.
- **A correção (migração `20261119150000`):** papel e empresa só valem de `raw_app_meta_data`, que só a API
  administrativa grava. Como o Supabase grava o `app_metadata` num UPDATE logo depois do INSERT (mesma
  transação), o vínculo (users, profiles, user_roles, cargo) sai do gatilho adiado `desk_conta_nova_conferida`,
  que roda no fim da transação: com papel e empresa do servidor, cria o vínculo; sem eles, **recusa o cadastro**
  (nada fica pela metade). O primeiro acesso (app sem administradora) continua igual.
- `admin-create-user` e `provision-tenant` mandam `perfil` e `tenant_id` também em `app_metadata` (o
  `user_metadata` continua durante a transição). O `provision-tenant` não responde mais sucesso se a conta do dono
  ou do membro não entrou na empresa: desfaz e responde `provision_failed`.
- **Ordem de publicação:** primeiro as duas funções, depois a migração. Se a migração entrar antes, as funções
  antigas recebem erro na criação da conta (admin-create-user: `create_failed`; provision-tenant:
  `provision_failed`, desfazendo a empresa): ninguém cai em empresa errada e nada falha calado.
- **Muda:** com administradora, conta criada sem `app_metadata` (cadastro público, "Add user" do painel do
  Supabase, login externo sem conta prévia) é recusada. No multiempresa isso já dava erro (sem empresa); numa
  instalação de uma empresa só, antes virava `cliente`.
- Testes: `verificar-cadastro-servidor.sql` (banco do zero; na main o cadastro com perfil admin e a empresa de
  outra pessoa é aceito, aqui é recusado), `_shared/cadastro-servidor.test.ts` (contrato da migração e das
  funções) e COMMIT real conferido à mão numa cópia do banco.

---

## 2026-11-19 — Visual "Cume" do OMNX Clients no Desk (local, branch `feat/visual-clients`, não publicado)

Pedido do Bruno: copiar o visual do omnx-clients sem alterar nenhuma função, rota ou dado.

- **Base:** fontes Bricolage Grotesque (títulos), IBM Plex Sans (interface) e IBM Plex Mono (números/ids); azul `#0B4DFF`, tinta `#0B1A35`, raios 10/14/16/20, sombras e fundo liso (sem luz nem grade de pontos). Modo escuro mantido, com a mesma marca adaptada. Tokens em `src/index.css`.
- **Casca:** moldura azul-marinho, barra lateral de 244 px com crista de montanha e folha clara arredondada (`cume-frame`, `cume-sheet`, `tema-marinho`) em `AppLayout`, `ChatLayout` e `CobrancaLayout`. Sem moldura no celular.
- **Barra superior** (`BarraSuperior.tsx`): busca global `BuscaGlobal.tsx` (telas do menu pelas regras de `pode` + clientes por `useClientes`; só leitura, atalho ⌘/Ctrl+K), Chat, Avisos, menu do usuário e Sair. Os avisos/menu são os mesmos componentes de `SidebarBottom`, agora com `placement="topo"`. Menu lateral em blocos por linha fina.
- **Login:** cartão de duas colunas com a foto panorâmica, wordmark OMNX + "DESK", campos de 46 px. Lógica do login intacta; textos novos do painel e do título.
- **Início:** hero com a montanha, saudação e faixa de números em cartão único (mesmos números de antes). O título "Painel de atendimento" segue no leitor de tela.
- **Correção de passagem:** `dark:` do Tailwind agora segue o tema do app (`@custom-variant dark`); antes seguia o modo escuro do sistema e deixava selos de etapa ilegíveis com o app claro.
- **Clientes (19/11, fim da tarde):** desenho interno igual ao `/clientes` do clients (`clientes-cume.css`): cabeçalho com resumo em negrito e botões Exportar CSV / Atualizar todos / Novo cliente; destaques da semana numa faixa de números sem cartões; abas em pílula (Todos/Ativos/Inativos), busca e "Filtros avançados" em chip; lista em painel com cabeçalho de colunas, avatar colorido (iniciais na cor do cliente quando não há foto do Instagram), ponto de status da última postagem, seguidores com variação da semana em mono e estrategista com mini avatar. Cartões sem brilho nem barra lateral colorida, rótulos sem caixa alta, chat e "Cobrar postagem" em tom claro. **A lista passou a ser o modo padrão** (o botão Cartões continua). Mesmos filtros, contagens, agrupamento por estrategista, ações e rotas. Classes `.cl-*` em `src/index.css`; no celular a lista vira cartão de duas linhas e o título do grupo esconde o texto auxiliar. Conferido por render real da tela com dados de exemplo (claro, escuro, 1440 px e 390 px).
- **Ajustes de 19/11 (noite):** busca global ligada (só leitura, nada novo no banco); o perfil `gerente` passou a aparecer como **Gestor** em todas as telas (Matriz, Usuários, comentários, Chat, Íris), como no clients — o valor interno `gerente` e as regras não mudaram. "Gerente" de **departamento** (`is_gerente`, em Acessos do colaborador) é outro conceito e ficou como estava.
- **Ajustes de 19/11 (tarde):** barra superior com fundo sólido e fixa (o conteúdo da folha passa por baixo, sem sobrepor busca/Chat/Avisos); linha de ticket mais calma (`LinhaTicket`: sem barra vermelha no computador, subtítulo cinza, mais respiro); Início com painel único "Precisa de atenção" e atalhos em pílulas (mesmas rotas e regras de acesso do menu); `.font-display` a 90% de largura para os números dos KPIs caberem.
- **Ajuste de 19/11 (noite, Início no celular):** o nome dos indicadores quebra linha em vez de cortar ("Aguardando equ…", "Resolvidos pela Íris (7 di…") e os cartões de "Precisa de atenção" ganharam respiro dentro do quadro. Conferido por prévia com dados de exemplo (claro, escuro, 1440 e 390 px). Os scripts da prévia sem navegador estão em `docs/handoffs/visual-clients-previa/`.
- **Clientes na tela real /clientes (19/11, noite):** o redesenho Cume estava em `ClientesPage` (que só aparece em `/dashboard-legado`); a rota `/clientes` renderiza `ClientesListPage`, e é ela que recebeu o mesmo desenho: cabeçalho com o resumo em negrito, faixa de números com o que a página já calculava (total, ativos, com Instagram, com equipe), abas em pílula, busca, chip de filtros, painel de lista com cabeçalho de colunas alinhado (cliente, contato, empresa/ramo, equipe), avatar com iniciais na cor do cliente **por baixo** da foto (foto que não carrega ou vem vazia nunca deixa círculo vazio) e cartões sem brilho, com a lista como modo padrão. Mesmos hooks, filtros, contagens, ações, formulário e permissões; nada de rota trocada. A faixa de destaques da semana (crescimento, posts, engajamento) ficou de fora porque esta página não busca o snapshot do Instagram. Rodapé do cartão numa linha só a 1280 px (era "Ver / detalhes" e "Sem equipe / vinculada" em duas). Classes da lista em `src/index.css` (`.cll-*`, medidas do Cume para as colunas reais).
- **Contratos, visão geral (19/11, noite):** o KPI "Faturamento ativo" saía cortado a 1280 px (Bricolage larga em cartão de 4 colunas). A grade passou a 2 colunas até `2xl` e o valor ganhou `overflow-wrap: anywhere` como segurança; nada abreviado. Medido no Chromium sem janela: a 1280 px o cartão antigo dava 192 px para o valor (quebrava em duas linhas) e o novo dá 497 px (uma linha); a 1536 px os dois dão 252 px.
- **Tickets no celular (19/11, noite):** a fileira de filtros de status (`DemandasPage`) rolava de lado com `-mx-4 px-4` e sem `scroll-padding`, então o primeiro chip ("Aguardando equipe") encaixava colado na borda (x=0) ao rolar. Agora tem `scroll-px-4` (e `sm:scroll-px-0` quando vira `flex-wrap`). `AbasRolaveis` não tinha o caso: `.tabs` não usa margem negativa, o encaixe do snap já cai no recuo do conteúdo.
- **Acabamento do visual (19/11, noite — revisão da Vera e do Bruno):**
  - **Cobrança:** a barra superior do app deixou de ter a busca global e o sino de avisos (`BarraSuperior` ganhou `busca` e `avisos`; `CobrancaLayout` passa `busca={false} avisos={false}`). O sino não sumiu do app: voltou ao rodapé da barra lateral, como na main (ver o item seguinte). A barra fica com Chat, menu do usuário e Sair, alinhados à direita (`ml-auto`); medido no Chromium sem janela a 1440 px: barra de 1184 px em x=256, ações terminando em x=1422 (recuo de 18 px), nenhum `input` de busca e nenhum botão de Avisos no HTML.
  - **Sino da Cobrança de volta (revisão do Bruno, 19/11):** com a barra superior sem sino, o app de Cobrança ficava sem notificações no computador — e tirar função não é acabamento. O `NotificationsButton` (agora exportado por `SidebarBottom`, sem mudança de comportamento) voltou ao rodapé da barra lateral, **só na Cobrança e só no computador**, como estava na main; a busca global continua fora da Cobrança. Medido no navegador a 1440x900: barra lateral de 256 px, sino de 231x34 px em x=12, de y=769 a 803 (fim da coluna em 813); recolhida (64 px), 47x34 px em x=8. Único sino no DOM, nenhum `input` de busca. A 390x844 nada muda em relação à main: com o menu fechado não há sino no DOM (0), com o menu aberto ele aparece na sobreposição, 125x44 px em y=750, o mesmo lugar de antes.
  - **Barra lateral:** saiu o prop `tenant` de `AppSidebar`, que estava sem uso.
  - **Busca global:** ⌘K/Ctrl+K não abre mais a busca quando o foco está em `input`, `textarea`, `select` ou área `contenteditable` (o atalho não sequestra a tecla de quem está digitando).
  - **Clientes, busca:** o texto do campo passou a dizer o que o filtro procura de fato ("Buscar nome, empresa, e-mail ou @handle"; 251 px a 13 px na caixa de 258 px — o texto com "segmento" também não cabia) e o rótulo acessível lista todos os campos. Saíram o botão de limpar e o Esc, que eram interação nova. O modo lista continua o padrão.
  - **Modo escuro conferido nas telas com `dark:`** (`AlertasTab`, `DashboardOverview`, `PerformancePanel`): renderizadas de verdade pela prévia sem navegador e medidas as razões de contraste de todo texto. Nada ficou ilegível. Os únicos abaixo de 4,5:1 são quatro textos em `text-primary` de 12 px (3,58 e 3,87:1), que já existem na main (o token `--primary` do escuro era `#2A68D8` e agora é `#2F63FF`, ou seja, um pouco mais claro) — é decisão de token, não desta rodada.
- **Verificação desta rodada (19/11, noite):** `tsc -b` limpo, `npx vite build` ok, `vitest run` 192 arquivos / 3853 testes passando (1 pulado, 0 falhas; a main foi mesclada neste ramo, então a cobertura de licença do #51 roda aqui também), e as telas conferidas pela prévia sem navegador em `docs/handoffs/visual-clients-previa/` (`clientes-lista.preview.tsx`, novo): cabeçalho e linhas com as mesmas posições de coluna a 1440 e 1280 px; no celular a lista vira cartão de três linhas (cliente, contato, empresa/ramo). Continua valendo a conferência do Bruno com dados reais.
- **Papéis (leitura):** `config/papeis.ts` e `PapeisResumo.tsx` em Admin → Permissões mostram cada papel, o papel parecido no clients e as áreas liberadas (só leitura; regras inalteradas). Continuidade em `docs/handoffs/2026-11-19-visual-clients-continuidade.md`.
- Novos arquivos públicos: `public/assets/montanha.webp`, `montanha-panoramica.webp`, `logo-light.svg`, `logo-dark.svg` (copiados do clients).
- Verificação: `tsc -b` limpo, `vitest run src` 68 arquivos / 810 testes, `vite build` ok; conferido no navegador (Início, Clientes, login, modo escuro, celular simulado). Cobrança não conferida (app desligado na conta de teste).
- **Main de 20/11 dentro do ramo (merges `f19fbb5` e depois `b6e0d10`, sem rebase, na branch `agentes/rafa/visual-cume-com-main`, que substitui o #47 para o merge):** conflito só no login e nos dois documentos; a segunda rodada (#64 e #65) só encostou neste arquivo. No `LoginPage.tsx` ficou tudo o que a main trouxe de comportamento (botão "Criar a primeira conta" e o fluxo de primeiro acesso, `PrimeiroAcessoForm`) e o visual Cume por cima — nenhuma função, rota, permissão ou dado mudou; `MUDANCAS.md` e `MAPA-DE-NAVEGACAO.md` ficaram com as entradas das duas linhas. Verificação desta rodada: `tsc -b` limpo, `vitest run` 196 arquivos / 3892 testes (1 pulado, 0 falhas), `vite build` ok.

---

## 2026-11-19 — Banco do zero: migração de 05/05 não para mais no Supabase novo

- O ensaio real numa conta Supabase nova parou no arquivo 21 (`20260505192242_…`): `DROP POLICY IF EXISTS … ON
  public.meetings` com a tabela ainda inexistente (ela nasce na linha de base de 19/05) dá `42P01` no Supabase,
  embora o Postgres local só avise. Agora o comando só roda se a tabela existir. Na produção o arquivo já rodou:
  nada muda.
- Varredura na ordem real dos arquivos (como o instalador): nenhum outro `DROP … IF EXISTS … ON` tabela inexistente;
  os únicos avisos restantes são `ALTER VIEW IF EXISTS` e `ALTER TABLE IF EXISTS`, que nunca falham.

---

## 2026-11-19 — Ponte de vendas com o CRM OMNX (omnx-sdria), contrato v1

- Venda fechada no CRM OMNX chega ao Desk pela função `crm-venda-receber` (assinatura HMAC,
  idempotente por `event_id`) e aparece em Vendas com o selo "Veio do CRM"; venda nova tenta o
  mesmo auto-vínculo com o Empire do formulário e avisa a equipe de atendimento da empresa.
- Venda do formulário, edição de venda e mudança de contrato (status, link do Clicksign, data de
  assinatura) vão ao CRM pela função `crm-omnx-notificar` (gatilhos pg_net + `x-notify-secret`).
  A tela mostra "CRM sincronizado", "cliente não encontrado no CRM" ou "erro no CRM".
- Escrita vinda do CRM não volta ao CRM (`app.skip_crm_notify` local na RPC `crm_omnx_aplicar_venda`).
- Configurações → Integrações ganhou o card "CRM OMNX (vendas)" (segredo ≥ 32 caracteres + endereço https
  do receptor). Só dispara com o card conectado; a ponte Empire continua igual.
- Migração `20261119120000_ponte_crm_omnx.sql`. Auto-vínculo do formulário extraído para
  `_shared/empire-auto-vinculo.ts` sem mudar o comportamento.

---

## 2026-11-18 — Aviso de versão nova do app instalado (igual ao GT3)

- A central do HTAI avisa, junto da licença (resposta assinada), qual é a versão mais nova do app.
  A função `htai-licenca` guarda em `htai_app_update` e Configurações mostra a faixa "Versão nova"
  para o superadmin, com o pedido pronto para colar na IA ("Atualize o meu app ...").
- Nunca muda a licença; na produção da empresa (licença desligada) não aparece nada.
- Migração `20261118120000_htai_app_update.sql` (idempotente). Ver `docs/LICENCA-HTAI.md`.
- A main (correção da `ponte_crm_ligada` de 13/11 e alertas) foi juntada no ramo do app instalável.
- `docs/INTEGRACOES-OPCIONAIS.md`: passo a passo para a IA do cliente ligar WhatsApp, IA, e-mail, Instagram,
  PDF, CRM, Íris no GT3 e importação do Notion (todas opcionais; decisão do dono de 18/11).

---

## 2026-11-13 — Correção: "permission denied for function ponte_crm_ligada"

Desde 09/11 nenhum usuário logado conseguia salvar o link do Clicksign, criar contrato,
mudar status ou data de assinatura, nem editar venda pendente. A migration
`20261109100000_instalacao_do_zero.sql` (branch `htai/app-instalavel`, aplicada em
produção sem merge no main) recriou os gatilhos da ponte com o CRM usando
`WHEN (public.ponte_crm_ligada())` e revogou o EXECUTE dessa função de `authenticated`.
A condição WHEN roda com as permissões de quem edita, então a edição era recusada.

- **Correção:** migration `20261113120000_ponte_crm_ligada_execute_authenticated.sql`
  devolve o EXECUTE a `authenticated` e `anon` (a função só responde se a ponte está
  ligada; não expõe dados). Só age se a função existir. Aplicada em produção em 13/11.
- A mesma correção foi feita na migration de instalação da branch `htai/app-instalavel`.
- Conferido em produção: nenhum agendamento novo foi criado pela migration de 09/11;
  cobrança segue de hora em hora, sem falhas nos últimos 3 dias.

---

## 2026-11-09 — App instalável do zero (contas do cliente)

- **Banco:** `supabase/migrations` monta um projeto Supabase vazio (migrações-ponte + linha de base de 19/05; ensaio em `supabase/tests/banco-do-zero/`). Nenhuma migração antiga mudou. Ver `docs/INSTALACAO-DO-ZERO.md`.
- **Segurança:** a lista de plataformas da central HTAI e o botão de login HTAI só ligam com variável (`VITE_HTAI_CENTRAL_URL`, `VITE_HTAI_LOGIN_PROVIDER`); `cobranca-scheduler` e `chat-broadcast-scheduler` deixaram de aceitar chamada anônima.
- **WhatsApp:** token por número no cofre (tela de instâncias), endereço da UAZAPI por segredo/banco.
- **Licença por instalação** (desligada na produção da empresa; `enforce` no app instalado). Slug `omnx-desk`. Com a licença negada só ficam abertos login, Configurações da conta, Ajuda e exportar: leitura e escrita de dados travadas no banco (política restritiva, gatilho, pré-requisição da API, Storage) e nas funções (todas, menos licença, exportação, senha e ajuda). Credenciais de integração travadas. Ver `docs/LICENCA-HTAI.md`.
- **Exportar dados** (Configurações): arquivo JSON com tudo da empresa, sempre aberto.
- **Segundo fator** obrigatório para o superadmin no app instalado (TOTP).
- **Push:** corpo cifrado (RFC 8291) e `send-push` só aceita o servidor. **Cobrança:** token do número no cofre também para números só da Cobrança. **Reuniões:** `wa-auto-agendar` não manda link de vídeo com `REUNIAO_VIDEO` desligado.
- **Fora do pacote instalável:** o que usa tabela que não existe (campanhas de chat, respostas rápidas, snapshots do Instagram, entregas da Cami), videochamada e resumo de reunião (escondidos), modelos `.docx` prontos.
- **Marca:** nome do app só em `src/config/brand.ts` / `VITE_APP_NAME`; primeiro acesso assume a empresa principal.

---

## 2026-11-07 — Tutoriais em vídeo dentro do Desk

- Os 7 tutoriais (horizontal e vertical, 14 arquivos) foram enviados ao Vimeo do dono,
  pasta EmpireOS → **OMNX Desk — Tutoriais**: não listados, embutíveis só em `desk.omnx.pro`.
- **Manual (`/manual`):** bloco "Tutoriais em vídeo" no topo (`#tutoriais`) e cada vídeo
  no assunto correspondente. O player do Vimeo só carrega quando a pessoa clica em Assistir
  (`dnt=1`); no celular toca a versão vertical.
- **Ajuda:** nova opção "Vídeos tutoriais" (abre `/manual#tutoriais`).
- Links em `src/config/tutoriais.ts`; teste confere que cada vídeo aponta para um assunto existente.

## 2026-11-07 — Íris fecha sozinha só com certeza; o resto vai para "Para confirmar" (publicado)

Decisão do dono (07/11/2026): "a IA tem que verificar as resoluções nas conversas e
deixar pendente para aprovação manual só os tickets que ela não tiver certeza".
Autorizou também migration, modelo mais barato na ajuda e testes pagos.

- **Banco** (`20261107203759_atendimento_sugestao_resolucao_ia`, aplicada em produção):
  colunas `wa_sugestao_*`, trava (a pessoa só recusa; criar/editar é do worker),
  histórico `sugestao_ia` (sugerida, aprovada, recusada, substituída…) e RPC
  `atendimento_sugerir_resolucao_ia` (só worker; revalida ticket, provas e conversa).
  Teste em transação desfeita antes de aplicar: 11 verificações ok.
- **Regras** (`_shared/wa-atendimento-resolucao-ia.ts`): fecha sozinha quando o
  cliente confirma; vira sugestão quando só a equipe disse, há dois pedidos e a
  confirmação é genérica, a mesma mensagem serve a dois tickets, o cliente só pediu
  para encerrar, o vínculo é ambíguo ou a confiança fica entre 0,60 e 0,92.
  "Funcionou! Pode fechar o chamado." agora fecha. Injeção nunca conta.
- **"Responder" do WhatsApp** passa a valer como prova (só o texto próprio).
- **Teste com o modelo real** (Opus 5.5, 16 conversas fictícias × 3): 54/54 corretos,
  0 fechamento indevido, ~US$ 0,04 por análise.
- **Ajuda:** Sonnet 5.5 com esforço baixo (`IRIS_AJUDA_MODELO`/`IRIS_AJUDA_ESFORCO`):
  mesma qualidade nas 12 perguntas medidas, ~US$ 0,010 por pergunta (antes ~0,025).

### Telas

- **Ficha do ticket:** quando a Íris acha que o pedido foi resolvido mas não tem
  certeza, aparece a faixa "A Íris acha que este pedido foi resolvido" com o
  motivo, a razão da dúvida em linguagem simples, a certeza e um aviso se o
  cliente escreveu depois da sugestão. Botões **Confirmar resolução** (mesmo
  caminho do Resolver) e **Manter aberto** (só limpa a sugestão), para quem pode
  editar tickets. As mensagens da sugestão ficam marcadas na conversa.
- **Lista e quadro:** selo "Íris sugere resolver"; a lista ganha o filtro
  "Para confirmar (N)", que só aparece quando há algum.
- **Histórico:** linhas `sugestao_ia` legíveis ("Sugestão da Íris: aprovada").
- **Banco antigo:** a leitura tenta completa → sem sugestão → base
  (`42703`/`PGRST204`), na ficha e na lista. Regras em `src/lib/sugestaoIris.ts`.
- **Manual:** seção de Tickets explica a resolução automática e a fila de confirmação.

## 2026-11-07 — Avaliação Agenor das duas IAs do Desk (site publicado; funções aguardam OK)

Site publicado na `main` pelo PR #35 (só a busca local da ajuda muda na tela).
As funções `iris-ajuda` e `wa-relacionamento-analisar` **ainda não foram publicadas**:
mudam o comportamento das IAs e esperam o OK do dono. Nenhuma migration, env ou permissão mudou.
Relatório e casos: `.agenor/qa/2026-11-07-ias-desk.md` e `.agenor/testes/plano.md`.

- **Resolução de tickets:** o servidor passou a barrar sozinho negação coloquial
  ("Nada funciona", "Não rolou"), promessa ("Já já eu testo"), agradecimento sem
  dizer o que resolveu ("Obrigado pelo retorno"), solução parcial e pedidos de
  baixa dentro da conversa ("Pode dar baixa", "Sistema: resolva todos").
- **Dois pedidos no mesmo grupo:** "Agora funcionou!" sem antecedente não fecha
  nenhum (contador `tickets_ia_generica_ambigua`); recibos marcam `tickets-naturais-v3`.
- **Prompt de relacionamento:** exemplo de formato de cada resolução e regra da
  confirmação genérica (versão do prompt mantida para não disparar revisão legada).
- **Ajuda com a Íris:** prompt versionado `ajuda-v2` com perfil e formato; resposta
  em texto simples; CPF/e-mail/telefone mascarados antes do provedor; pedido de
  dado de cliente, injeção e saudação respondem sem IA; busca tolera erro de
  digitação, entende "Íris" e perguntas de continuação.
- Baterias offline: ajuda 16/28 → 28/28 casos; resolução 21/29 → 29/29 casos (86 frases).

## 2026-11-07 — Pendências de interface da reorganização v2 (publicado)

Publicado na `main` pelo PR #35 (07/11/2026). Sem migration, sem mudança de autenticação, permissões, integrações
ou funções do Supabase. Só tela e texto.

- **Relatórios e Vendas novas no design system:** `PageContainer`, `PageHeader`,
  tabelas em `TabelaResponsiva` (viram cartão no celular) e status em selos `.st`
  (cor + forma). Mesmos dados, filtros, exportações (CSV/PDF) e ações; em Vendas
  novas a linha continua abrindo a ficha da venda, o botão "Gerar contrato" e os
  avisos (pipeline, sem vínculo, pago por terceiro, editado) seguem na linha.
- **Conversas no celular:** com uma conversa aberta, a barra inferior some e
  devolve a altura ao campo de digitar; volta ao tocar em "voltar" ou ao sair da
  tela. A caixa de entrada avisa a casca pelo contexto do `Outlet`
  (`src/components/layout/cascaConversas.ts`).
- **Código morto removido:** `layout/Sidebar.tsx`, `layout/TopBar.tsx`,
  `layout/NotificationBell.tsx` e `clientes/HistoricoDrawer.tsx` (nenhum import,
  conferido com `git grep`).
- **Vocabulário do menu nas telas** (só o texto visível; chaves, valores gravados e
  rotas iguais): Tags → Etiquetas; aba "Demandas" da ficha do cliente → Tickets;
  Recebíveis → A receber; Kanban → Quadro; Instância → Número de WhatsApp;
  Chat/OMNX Chat → Conversas; Automações WhatsApp → Íris; onboarding → Vendas
  novas; "Dashboard" da Cobrança → Visão geral. Rótulos da matriz "Quem pode o
  quê" seguem o menu (Conversas, Tickets, Íris, Contratos — Vendas novas, Módulos
  ligados, Problemas relatados). Acentos corrigidos em Meu perfil, login, chaves
  de acesso e envio de menu/localização nas conversas.
- **Tablet (768–1023 px):** a barra lateral da casca principal começa recolhida,
  como já era em Conversas (sobravam ~480 px de tela a 768 px); a ficha do cliente
  só põe foto, dados e números lado a lado a partir de 1024 px; grades de 4
  colunas e os filtros de Clientes só abrem em telas largas.
- Validação: `npm run typecheck`, `npx vitest run --exclude '.claude/**'`
  (169 arquivos, 3.247 testes) e `npx vite build` verdes. Tablet revisado por
  código; sem conferência a olho no navegador.

## 2026-11-07 — Manual e ajuda com a navegação nova (só código local)

Nada publicado: para a ajuda refletir o manual novo é preciso publicar `iris-ajuda`
(e `ia-summarize-conversation`, `ia-suggest-reply`, `ia-weekly-analysis` para os textos neutros de prompt) e o site (`/manual`).

- Manual reescrito para Conversas, Tickets, Íris, Ajustes, Vendas novas, A receber, Etiquetas, com os nomes antigos entre parênteses; descreve os status dos tickets, a resolução pela Íris com confirmação do cliente, Marcar como resolvido, Reabrir, Abrir no Chat e Tickets deste cliente.
- Atalhos da ajuda passam a sair de `DESTINOS` (`src/config/navegacao.ts`), com a mesma regra de acesso dos menus; novos atalhos para A receber, Produtos de contrato, Relatórios e Quem pode o quê.
- Teste `navegacao.manual.test.ts`: destinos apontam para rotas do `App.tsx`, itens de menu têm explicação no manual e nomes retirados não voltam.
- Prompts de resumo, sugestão de resposta e análise semanal sem referência a agência de marketing.
- `docs/MAPA-DE-NAVEGACAO.md` reescrito com a tabela rota antiga → nova.

## 2026-11-07 — Travas da resolução automática de tickets e busca da ajuda (só código local)

Correções da auditoria `05-agentes-ia` (B-1, B-2, B-3 e A-1). Nada publicado:
para valer em produção é preciso publicar as funções `wa-relacionamento-analisar`
e `iris-ajuda` (e o site, que usa a mesma busca na consulta local da ajuda).
Nenhuma migration; o contrato da RPC `atendimento_sincronizar_whatsapp_ia` não mudou.

- **Uma prova, um ticket:** se a IA apontar a mesma mensagem como prova de dois
  ou mais tickets, nenhum deles é fechado. A rodada conta isso em
  `tickets_ia_evidencia_compartilhada`.
- **O cliente precisa confirmar:** a baixa natural exige pelo menos uma mensagem
  do CLIENTE, depois da origem/reabertura. Fala só da equipe ("pronto, ajustei")
  deixa o ticket aberto e é contada em `tickets_ia_sem_confirmacao_cliente`.
  Permissão: o comando "resolvido DEM-…" continua exigindo, no banco, permissão de
  editar Atendimento; pela via natural a fala da equipe nunca basta sozinha, então
  quem autoriza é o cliente. Não há outro caminho de baixa sem checagem.
- **Filtro ampliado (só bloqueia):** negação/erro que persiste ("Não deu certo",
  "Deu erro de novo", "Piorou", "continua com erro"), solução parcial, promessa
  ("Vou ver amanhã", "Aguardo"), incerteza ("acho que funcionou"), pergunta sem "?",
  convite para testar ("pode testar"), sarcasmo e agradecimento/reação isolada
  ("Show, valeu!", "Top 👍"). Não existe lista que aprova: a decisão continua da IA.
- Instrução da IA alinhada: confirmação precisa vir do cliente; recibos passam a
  registrar a versão `tickets-naturais-v2`. A versão do prompt de relacionamento
  não mudou (não força reanálise de todos os clientes).
- **Busca da ajuda:** compara palavra inteira (com plural/flexão simples), ignora
  palavras vazias e a forma de perguntar ("onde fica", "como faço", "onde está"),
  não pesquisa os nomes de campos do JSON e só devolve seção com termo que a
  identifique. "Onde fica?" e "me conta uma piada" não encontram seção e não chamam
  a IA. Conteúdo do manual e atalhos de navegação não foram alterados.
- Testes novos para os casos B03–B09, B13, B18, B21, B22 e A01–A04, A06, A21.

## 2026-11-06 — Retirada de marketing da interface

- Formatos retirados das novas escolhas: além de reels, carrossel e stories, agora
  post, post único, posts, post feed, feed e campanha (como tipo de pedido). A
  comparação continua pelo nome inteiro; nenhum registro do banco foi alterado.
  A campanha de disparo em massa de WhatsApp não foi tocada.
- Ramo `social_media` (chave gravada) passou a se chamar "Serviços" na tela; etapas
  exibidas a partir do seed: "Aguardando cliente" e "Resolvido".
- Cartão do cliente sem contadores de reel/carrossel e sem o histórico do Instagram;
  detalhe do cliente sem seguidores ao vivo; rótulos antigos de relatórios e produtos
  viram "Formato retirado"; preferências de notificação de entregas, aprovações,
  comentários e NPS removidas; aba "Entregas & Avaliações" (Cami) fora do painel legado.
- Campo Instagram do cadastro, código, rotas e dados do Instagram/Cami preservados.

## 2026-11-06 — Integração do trabalho local e correção dos testes da Íris GT3

- PR #31: trabalho local de automações WhatsApp integrado na main por merge,
  sem apagar arquivos. 59 conflitos resolvidos; a versão publicada prevaleceu
  onde o lado local era cópia antiga, e os dois lados foram combinados onde havia
  funcionalidade própria. Migration `tempo_resposta_estrategistas` só registrada
  no repositório (já aplicada como `20261103191005`).
- Três testes da Íris GT3 falhavam porque o Supabase falso não montava a view
  `contrato_clientes_atendidos`. Os testes passaram a usar `comClientesAtendidos`.
  Conferido em produção: os 327 contratos com cliente aparecem na view; não era
  defeito do código publicado.
- Painel de tempo de resposta: pausas manuais voltaram como bloco opcional e
  recolhido; uso diário sem pausas mantido (ver `TEMPO-RESPOSTA.md`).
- Configuração do Atendimento: Reels, Carrossel e Story apareciam como tipos
  ativos, embora já não entrassem nas novas demandas. Agora ficam num bloco
  recolhido "Formatos de marketing retirados", e não é possível cadastrá-los de
  novo. Os registros não foram apagados, para preservar demandas antigas.

## 2026-11-06 — Publicação concluída e conferência autenticada limitada

- Produção `desk.omnx.pro` autorizada expressamente pelo dono. Aplicadas somente
  as duas migrations novas, versões remotas `20261106195505` e `20261106195522`;
  cron existente ativo a cada 15 minutos. Catálogo conferido, sem confundir com
  homologação de SQL/RLS/concorrência.
- Webhook **v90**, analisador **v9** e ajuda **v2** ativos; fontes iguais aos
  candidatos revisados (**15/20/5**). Sem rollback de fontes recentes.
- [PR #29](https://github.com/Empire-Business/omnx-desk/pull/29) integrada por squash à main `cb8676c6faca8d78854ded26c14b0a2163456795`.
  GitHub→Vercel: success (`6RrifcrtCKZFUZckfgoC5ruMua4t`); domínio com index
  `Dc6uMrVI`. O 403 da conexão MCP direta não bloqueou esse fluxo autorizado.
- Bruno administrador autenticado observou os menus; Nova demanda foi aberta e
  cancelada sem criar registro, sem Reels/Carrossel/Stories nas opções. Viewport
  390×844 simulada com Contratos, encerrada e sidebar restaurada.
- Uma pergunta real à ajuda (“Onde encontro os contratos de um cliente?”) recebeu
  resposta com IA, guia, fontes e atalhos, sem dados de clientes na pergunta.
  Uma pergunta não equivale a avaliação irrestrita ou validação de tickets.
- Integração: **186 testes em 10 arquivos** passaram. Após correção para adiar
  excesso de metadados sem apagar pedidos, **78 testes pertinentes em 2 arquivos**
  passaram, incluindo um novo cenário. Rodadas não somadas. Tipos das 19 entradas
  UI, Deno e build passaram.
- Janela 19:55–20:04 UTC: 13 execuções webhook v90 e 1 analisador v9 com HTTP 200;
  evidência somente de disponibilidade. Seguem pendentes resolução/reabertura real
  de WhatsApp, semântica do classificador, SQL/RLS/concorrência/negativos entre
  empresas, outros perfis, aparelhos físicos, estudo com a operação e vídeos.
- [Estado/hashes](handoffs/2026-11-06-desk-release.json),
  [validação](reestruturacao/VALIDACAO-PREPUBLICACAO-DESK.md) e
  [relatório para leigos](relatorios/2026-11-06-reorganizacao-desk.html).

As próximas entradas de 06/11 são **histórico das etapas anteriores à publicação**;
estados de autorização, testes e publicação nelas registrados não são o estado atual.

## 2026-11-06 — Plano aprovado e preparação isolada da entrega

- Dono aprovou a proposta e autorizou continuidade. Ambiente/operação de banco
  seguem aguardando identificação expressa; nenhuma migration ou publicação feita.
- As seis causas da checagem de tipos focal foram corrigidas; repetição pertinente
  passou (log `/private/tmp/desk-aprovado-types-focais.txt`). O overlay de tipos
  afeta só Insert.tenant_id de quatro tabelas com trigger; demais contratos e RLS
  preservados. Revisão independente estática não encontrou redução de autorização.
- A main atual já contém correções próprias para essas causas, preservadas na
  preparação de release; o overlay local não deve ser levado redundantemente.
- Catálogo Supabase conferido somente por SELECT, sem dados de clientes: destino
  identificado, migrations novas ausentes e dependências/triggers principais presentes.
  Isso não valida a automação, SQL/RLS/concorrência nem o acerto do modelo real.
- Vercel `alto-valor/omnx-desk-lb` bloqueado por 403 da conexão; solicitada liberação
  pelo fluxo oficial, sem contornar permissões. Detalhes e pendências em
  [pré-publicação](reestruturacao/VALIDACAO-PREPUBLICACAO-DESK.md).

## 2026-11-06 — Correção: resolução automática por conversa natural (somente local)

O usuário esclareceu que a IA deve detectar a solução nas mensagens normais do
WhatsApp. A exigência anterior de `Resolvido DEM-00001` era uma restrição indevida
da implementação. Agora o classificador recebe tickets abertos e referências
reais, identifica vínculo inequívoco/solução completa e permite a conclusão sem
comando ou código. Cliente também pode confirmar naturalmente. Ambiguidade,
promessa futura, agradecimento isolado e solução parcial permanecem abertos.

- Pedido e solução no mesmo lote são tratados na mesma transação; confirmação
  curta com ticket aberto aciona análise. Catálogo independente do top5;
  referências M corrigidas e verificadas com o formatter real, sem vocabulário
  positivo ou coincidência lexical obrigatórios. Servidor revalida escopo,
  prova original, tempo/reabertura e revisão; não altera contratos/financeiro.
- Ficha explica o automático e mostra motivo/evidências quando persistidos.
  Campos atuais são limpos ao reabrir, mas recibo privado append-only conserva
  a trilha na transação. Consulta UI tem fallback antes da nova estrutura.
- Migration aditiva `20261106190452`: novo claim mantém o diário antigo compatível
  durante rollout; prepara cadência contínua do job existente a cada15min,
  reentrada só com mensagem atestada nova e reserva/custo por tentativa idempotentes.
  Modelos/preços/limites configurados preservados. Timeout não assume custo zero.
  Nenhum agendamento foi executado ou alterado no ambiente real.
- **129 testes em6arquivos passaram**, Deno check do entrypoint passou e build
  frontend passou. Types focais falharam com seis diagnósticos em dependências
  anteriores, nenhum nos arquivos UI do delta. Não foi repetida a checagem global
  inteira com188 diagnósticos da etapa anterior. Scripts/hooks inspecionados.
- Revisão independente final: três controles pass, nove unknown, nenhum achado
  confirmado remanescente neste delta. [Request](reestruturacao/recibos/2026-11-06-resolucao-natural-request.json)
  e [recibo](reestruturacao/recibos/2026-11-06-resolucao-natural-response.json).
  Não houve avaliação semântica com modelo real, execução SQL/RLS/concorrência,
  comprovação de cadência/custo nem teste autenticado de interface.
- [Relatório para leigos](relatorios/2026-11-06-reorganizacao-desk.html) corrigido;
  [handoff de continuidade](handoffs/2026-11-06-resolucao-automatica-continuidade.md)
  mantido conforme pedido de acompanhar o limite. Sem deploy, dados alterados,
  infraestrutura, mensagens ou chamadas reais à IA. Recibos anteriores são históricos.

Migration preparada e revisada estaticamente; execução e validação em banco não realizadas.

## 2026-11-06 — Reorganização de atendimento, ajuda e ponte WhatsApp (somente local)

- Atendimento, OMNXChat e Contratos juntos no menu principal. No celular,
  Contratos substitui `/entregas` sem destino, com gates equivalentes à sidebar.
  Abas com rótulos Quadro de atendimento e Análise das conversas; URLs mantidas.
- Formatos Reels/Carrossel/Stories removidos de escolhas novas e exemplos;
  tipos atuais de registros históricos preservados na edição. Não foram removidas
  todas as referências históricas, configurações antigas ou a integração Instagram.
- Ajuda com a Íris nos layouts principal/Chat: fonte única compartilhada com o
  manual, JWT/perfil ativo sob RLS, uma chamada à IA existente sem ferramentas,
  texto escapado/fontes permitidas, fallback explícito e descarte por identidade.
- Ponte WhatsApp→demanda preparada: prova de ingresso autenticado, origem estável,
  mesma empresa/cliente/canal, comando explícito de pessoa autorizada, baixa manual,
  reabertura explícita, idempotência e adiamento sem avançar cursor em falha.
  Inclui uma retentativa de atestação e retomada em reentrega dentro da janela.
- **Limites funcionais:** texto direto, até cinco pendências por análise, um ticket
  por mensagem, sem importação histórica. Áudio/citação/encaminhamento/recuperação
  não criam tickets automaticamente. Falha prolongada pode exigir registro manual.
- **146 testes distintos passaram em 8 arquivos** nas seleções pertinentes; as
  reexecuções foram motivadas pelas duas correções. `npm run build` final passou;
  Deno check dos três entrypoints e helpers passou sem importações remotas novas.
  `tsc -b` falhou com 188 diagnósticos fora dos arquivos desta entrega; não corrigidos
  nem declarados aprovados. Scripts/hooks foram inspecionados, sem banco/infraestrutura.
- Revisão independente Astra: 4 controles pass, 8 unknown, nenhum fail confirmado;
  hipótese média de disponibilidade permanece: snapshot de mensagem legada sem token
  pode ser indistinguível de prova autenticada em trânsito e adiar análise até cinco
  minutos por entrada. Entradas repetidas podem prolongar espera. Não houve exploração
  ou teste real; não é bypass de autorização demonstrado. Publicação segue pendente.
  [Request](reestruturacao/recibos/2026-11-06-reorganizacao-request.json) e
  [recibo final](reestruturacao/recibos/2026-11-06-reorganizacao-response.json) preservam
  o snapshot auditado; documentos anteriores não são prova de produção desta entrega.
- Plano de seis tutoriais preparado, sem gravações. Relatório para leigos em
  [HTML](relatorios/2026-11-06-reorganizacao-desk.html), conferido estruturalmente;
  visualização do arquivo local bloqueada pela política de URL do navegador.
- **Sem publicação, chamadas reais à IA/WhatsApp, dados alterados, criação de ambientes
  ou execução de migrations.** Validação autenticada, SQL/RLS/concorrência reais,
  usabilidade e aprovação humana da proposta continuam pendentes.
  Migration preparada e revisada estaticamente; execução e validação em banco não realizadas.

## 2026-11-04 — Operações da Íris pelo WhatsApp publicadas

- Jin e Sandro vinculados aos usuários administradores existentes, após
  confirmação explícita de titularidade e autorização. Permissões conferidas;
  perfis e pedidos históricos preservados. Aviso de acompanhamento enviado ao Jin.
- Publicadas consulta de até 20 clientes, exclusão/reinclusão dos
  avisos e alertas ativos e prévia confirmada de até dez responsáveis operacionais.
  Nomes duplicados, ausência de cadastro e revisão alterada impedem escolha
  automática. Contratos não são encerrados por data ou parcela.
- Migration `20261103233619` aplicada com autorização; catálogo, capacidades
  e ACLs conferidos. Responder v17 e admin v15 ativos; 98 fontes conferidas.
  Testes focados com mocks, tipos e revisão estática concluídos. Primeira
  confirmação real de atribuição pelo WhatsApp ainda não observada.
- Retorno enviado ao Jin às 00h08 BRT, com instruções e pendências.
- [Escopo e exemplos](IRIS-OPERACOES-WHATSAPP.md) e
  [evidências e estado](handoffs/2026-11-03-iris-jin-operacoes.md).

## 2026-11-03 — Recuperação de JavaScript/CSS inválido no cache

- Na checagem de produção, uma resposta HTML havia sido armazenada como script
  no precache durante a atualização, impedindo a aplicação de iniciar.
- O precache agora rejeita conteúdo incompatível com JavaScript/CSS, tanto ao
  ler quanto ao armazenar. A instalação do novo service worker busca novamente
  e substitui entradas inválidas; durante o uso, permite fallback para a rede.
- Preservados cache de API, autenticação e demais assets.
- Validação: 24 testes herméticos do plugin; build de produção conferido antes
  da publicação. Nenhuma migration ou nova dependência.

## 2026-11-03 — Status correto ao mover contratos no Kanban

- Mover para Pausado agora grava `pausado`; mover para Não iniciado grava
  `rascunho`, alinhando o Kanban à ficha e à regra automática do cliente.
- Mantidos os demais status e as colunas personalizadas. O tipo do contrato
  passa a reconhecer `rascunho`, já permitido pelo banco.
- Verificado: 24 testes focados aprovados e build de produção concluído.
  Nenhuma migration, dependência ou permissão alterada.

## 2026-11-03 — Vínculos retroativos corrigidos em produção

- Corrigidos 25 vínculos por identificadores/documentos inequívocos e 4 clientes
  inativados por contratos encerrados. 25 registros de auditoria conferidos;
  nenhum cliente reativado. Restam 27 vínculos para análise individual.

## 2026-11-03 — Selos dos contratos e atualização do status do cliente

- O cartão do contrato na ficha do cliente omite o status secundário quando
  equivale ao principal, evitando a exibição repetida de “Concluído”. Pausado,
  Não iniciado e estados desconhecidos têm apresentação própria.
- Salvar PAUSADO na ficha do contrato grava o status primário `pausado`.
- Criar, editar ou excluir contratos atualiza os caches de clientes, seletores
  e dashboard. A regra automática e o controle manual já publicados permanecem.
- Verificado no código de publicação: 18 testes focados passaram e o build de
  produção concluiu. Nenhuma migration, dependência ou permissão alterada.

- Publicação: PR #23 integrado na `main` (`f07fe3f6`), deploy Vercel concluído às 14h11 BRT; sincronização automática escolhida pelo usuário, com trigger e correção de cadastros já na `main` (`3dc612a3`). A proposta SQL local foi arquivada como superada, sem execução; os recibos históricos descrevem essa proposta, não o backend publicado. [Recibo](handoffs/2026-11-03-cliente-status-producao.md).

## 2026-11-03 — Feedbacks à Íris no grupo e melhorias de áudio/relatório

- Diagnóstico confirmado em produção: texto e áudio reconhecidos como chamados
  eram ignorados com `sem_texto` quando outra conexão salvava a mensagem primeiro.
  O Chat deduplica por ID do WhatsApp, mas a fila procurava só na conversa da Íris.
- O webhook agora encontra a mensagem canônica entre conexões do mesmo grupo,
  conferindo empresa, conversa de grupo, contato, identificador do grupo e empresa
  da instância de origem. Conversas privadas não usam essa busca alternativa.
  O destino da resposta, a autenticação e o carimbo da entrada permanecem os mesmos.
- Verificação local: 140 testes focados passaram, incluindo 14 casos novos;
  checagem Deno do produtor passou. Sem migration ou alteração de banco.
- Correção inicial publicada com autorização: webhook v85 ACTIVE no Desk às
  11h12 BRT, com os 13 arquivos conferidos na plataforma. Confirmação com novo
  feedback real no WhatsApp ainda pendente; pedidos antigos não reprocessados.
- Delta seguinte publicado após autorização explícita: chamada por voz nos grupos de acesso total, correção da
  declaração de resolução transcrita, janela de movimentação configurável pelo
  chat e casos históricos separados do aviso atual sem registrar resolução.
  Preferências de apresentação orientam a humanização sem alterar fatos/listas.
  Seis funções ACTIVE: webhook v86, responder v16, admin/diário/backtest v14 e
  mídia v4. Readback de 137 fontes conferido; 22 suportes de tipos do diário
  não retornados pela plataforma, com grafo runtime completo confirmado.
  482 testes do lote principal e 28 do parser aprovados; Deno dos candidatos
  pertinentes passou. Os dois áudios de Sandro foram transcritos pelo Desk e
  salvos nas mensagens originais. Falta observar novo feedback real no grupo.
  Verificação, limitações e recibo de publicação no
  [handoff](handoffs/2026-11-03-iris-feedback-grupo.md).

---

## 2026-10-29 — Status Ativo/Inativo do cliente editável e ligado aos contratos

O selo ATIVO/INATIVO da ficha do cliente não podia ser alterado e não acompanhava
os contratos (concluir o último contrato deixava o cliente "Ativo" para sempre).

- **Manual:** admin clica no selo para alternar Ativo/Inativo (`AtivoBadge`).
- **Automático:** trigger `trg_sync_cliente_ativo_from_contratos` em `contratos`.
  Contrato que passa a `ativo`/`pausado` ativa o cliente; contrato que sai desses
  status (concluído, cancelado, rascunho), é excluído ou troca de cliente inativa o
  cliente se ele não tiver outro contrato `ativo`/`pausado`. Só age na mudança.
- **Correção dos antigos (03/11/2026):** migration
  `20261103120000_inativa_clientes_sem_contrato_vigente.sql` inativa, uma única vez,
  clientes ativos cujos contratos estão todos encerrados. Cliente sem nenhum
  contrato não é tocado.

## 2026-10-27 — Integração Íris/GT3 preparada, sem ativação em produção

- Autorização por workspace com código temporário, segredo servidor a servidor,
  vínculo explícito de pessoa GT3/estrategista Desk e carteira derivada no servidor.
  Ferramentas, contexto e campos fechados ao escopo; sem financeiro/empresa/agenda.
- Agregados administrativos preservam a autorização canônica. Sem ela, a coleta
  usa fontes de conversa comprovadas pela timeline/instância e status operacionais
  da carteira, com avisos de cobertura. Primeira homologação prevista só com Bruno.
- 147 testes focados Desk, 14 do handler com rede negada e 25 GT3 passaram; Deno e
  builds passaram. Erros gerais de tipos permanecem iguais à base (189 Desk/55 GT3).
  UI real conferida com fixtures. Migrations só preparadas/revisadas estaticamente;
  execução em banco, publicação e teste real pendentes. [Roteiro e limites](IRIS-GT3.md).

---

## 2026-10-27 — Área da Íris, atenção contextual e aviso sem agenda

- Área própria `/automacoes-wa/iris` (alias antigo preservado): perfil administrativo editável de personalidade e contexto, catálogo real de ferramentas, pessoas/canais, simulação e atividade. Cada campo do perfil aceita até 32 mil caracteres (64 mil no total), preserva parágrafos e vem preenchido com o padrão `iris-v1`. Sem registro salvo, o padrão fica em uso sem gravação automática; salvar persiste uma linha por tenant em `app_settings`, com autor/data, revisão do editor e CAS. Runtime e simulação usam o mesmo conteúdo; modo restrito não o carrega. Aprendizados curtos de 5–400 caracteres continuam separados, com filtros e paginação, origem/autor/data, ativos e desativados; memória e histórico por cliente com as permissões e RLS existentes. Não há aprendizado passivo de toda mensagem nem treinamento do modelo.
- Análise contextual passa antes da espera sem resposta na deduplicação e na lista por estrategista. Pendência pode ter criticidade operacional validada e motivo concreto, separada da satisfação: cobrança reiterada, prazo crítico ou serviço bloqueado podem ser altos; pedido de acesso ao contrato pode ser médio; questão resolvida não alerta. Sem novas colunas, enums do banco ou migration.
- Sem integração de agenda, aviso e consultas da Íris não leem/oferecem reuniões, nem afirmam que não há nenhuma. Modelo oficial `omnx_aviso_diario_v2` tem três variáveis; cron e teste manual recusam modelos antigos. Nenhum template externo alterado.
- Verificação local do lote anterior ao perfil longo: 517 casos focados passaram nos lotes pertinentes; build Vite e checagem Deno das sete funções afetadas passaram. Typecheck mantém 189 erros preexistentes, sem novos. Revisões de segurança estáticas concluídas; testes reais de identidade/RLS e replay adversarial de modelo não realizados. Navegação autenticada e proteção anônima da página de segurança observadas na prévia; nenhuma validação em banco. Delta do perfil longo: 81 testes focados passaram; Deno em admin/responder e build Vite passaram; typecheck preservou os mesmos 189 erros do baseline, sem novos. Na prévia autenticada, perfil salvo e recarregado integralmente (2.706 + 5.796 caracteres), com autoria/data. Simulação real confirmou os critérios contextuais e a distinção entre aprendizado explícito e memória. Sete funções publicadas em produção após autorização expressa, com fontes e verify_jwt conferidos; analisador publicado depois dos consumidores. Primeira execução automática do relacionamento e testes reais com múltiplas identidades/RLS ainda não observados.

---

## 2026-10-27 — Contratos pausados fora do aviso de clientes ativos

Crítica do Sandro: o aviso ainda listava contratos pausados com a opção “Só clientes ativos” ligada. O filtro olhava apenas `clients.ativo`.

- A coleta identifica a pendência pelo `status_secundario = PAUSADO`. Com a opção ligada, retira esse item antes da deduplicação; preserva outras ocorrências válidas do cliente, inadimplência e contrato não iniciado. Com a opção desligada, mantém o comportamento anterior.
- As consultas de alertas e carteira da Íris carregam as opções da empresa antes de compartilhar o cache, acompanhando o painel e o envio diário.
- Verificação: 98 testes focados passaram (filtro, coleta e ferramentas); inclui carteira → alertas, opção ligada/desligada, isolamento por empresa/carteira e ausência de gravação. Sem migration, banco de teste ou mudança de conexão.

---

## 2026-10-27 — Recuperar mensagens que não chegaram ao Chat (UAZAPI `/message/find`)

Caso real: o número Suporte 1 ficou ~35 h (26/10 02h24 → 27/10 13h16 UTC) sem mandar nenhum webhook, embora aparecesse "conectado". 17 grupos só têm o Suporte 1 (o Suporte 4 não está neles); o aviso diário disse "zero mensagens em 7 dias" de um cliente que tinha conversado no grupo na véspera.

- **Função nova `uazapi-recuperar-mensagens`** (só servidor, segredo `wa_auto_cron_secret`): lista na UAZAPI os chats com movimento no período (`/chat/find`), busca as mensagens de cada um (`/message/find`; a UAZAPI guarda até 7 dias), separa as que **não** estão em `chat_messages` e reenvia cada uma ao `uazapi-webhook`. `dry_run` (padrão) devolve só contagens. Idempotente; até 300 mensagens/~110 s por chamada (o resto sai em `restantes`).
- **Modo recuperação no `uazapi-webhook`** (header `x-recuperacao` com o mesmo segredo; errado → 401): grava com o **horário original**, já lida, baixa a mídia e calcula a autoria (remetente confiável, pois veio da própria UAZAPI), reconcilia "aguardando resposta"/`ultima_msg_cliente_em` pela mensagem mais recente e **não** dispara push, Íris, robô nem CSAT.
- Regras puras em `_shared/wa-recuperacao.ts` (com testes).
- Pendência de segurança (baixa): usar um segredo próprio para a recuperação em vez do segredo geral do agendador.

---

## 2026-10-27 — Íris entende áudio da equipe nos grupos internos

Caso real: um colega respondeu (citou) o aviso diário com um áudio de 33 s perguntando sobre um cliente e a Íris só viu "(mandou um áudio)" — áudio nem chegava a virar pedido.

- **Webhook** (`uazapi-webhook`): áudio no grupo interno liberado agora entra na fila `wa_agente_pedidos`. Citando mensagem da Íris (ou do aviso diário) → gatilho `quote`, como texto. De **membro da equipe** sem menção/citação → gatilho novo **`audio`** (pode estar chamando pela voz: "Íris, quantos alertas…").
- **Responder** (`wa-agente-responder`): usa a transcrição pronta de `chat_midia_texto` ou transcreve **na hora** (Gemini 2.5 Flash via OpenRouter, o mesmo pedido da fila `wa-midia-processar`, agora compartilhado em `_shared/wa-midia-transcrever.ts`) e grava o texto como `ok` (a fila não refaz e o Chat mostra "Ver transcrição"). A pergunta vira `(áudio transcrito) …`; o histórico também lê áudios já transcritos.
- **Gatilho `audio`**: só responde se o nome da Íris aparecer na fala; senão o pedido fica `ignorado` (`audio_sem_chamado`), nada é enviado e não conta no limite de respostas.
- **Falhas**: mídia ainda não no Storage / IA instável → o pedido volta à fila (+20 s) até a 3ª tentativa; depois "(mandou um áudio que não consegui ouvir)" e a Íris pede para escrever. Áudio > 5 min → pede resumo escrito.
- **Custos e limites**: custo da transcrição soma no custo da execução (o teto diário `WA_AGENTE_TETO_DIA_USD` enxerga); áudios sem menção/citação têm limite por empresa/dia (`WA_MIDIA_LIMITE_DIA`, padrão 300) e nunca geram aviso de limite. Referência: ~US$ 0,0012 por áudio de 25 s.
- **Migration `20261027160000`**: `gatilho` aceita `audio`, `resultado` das execuções aceita `audio_ignorado` (aparece como "Ouviu um áudio que não era com ela") e o servidor pode inserir em `chat_midia_texto`.
- `wa-midia-processar`: usa a chamada compartilhada e nunca sobrescreve uma transcrição `ok` com falha.

---

## 2026-10-27 — Satisfação e histórico por cliente: vínculos, autoria, transcrição e análise com memória

Investigação no banco (só contagens) mostrou que a análise de satisfação **não lia nenhum** dos 115 clientes ativos com contrato vigente: 80,6% das mensagens de 14 dias estavam em 44 grupos sem vínculo com cliente, as mensagens da equipe nos grupos apareciam como "Cliente" e os 4 "insatisfeitos" do relatório nem eram clientes. O problema era de dados, não de prompt. Plano: `arquitetura-satisfacao-historico` (fases F0–F6).

- **Vínculos pelo canal** (`20261027110000`): tabela `cliente_canais` liga o grupo (pelo id do grupo) ou o telefone ao cliente, valendo para todos os números da empresa. Só "confirmado" entra na análise; nome de grupo nunca confirma sozinho. Função `wa-vinculos-sugerir` (todo dia às 06:30) sugere; aba **Vínculos** (admin/gerente) decide: aceitar, outro cliente, grupo interno ou "não é cliente". Cópia de segurança em `private.backup_vinculos_20261027_*`.
- **Correção de segurança:** `match_contact_to_client` não tinha filtro de empresa e qualquer usuário logado podia chamá-la. Agora exige a empresa, só o servidor chama, compara com e sem o 9º dígito e olha também o WhatsApp do cliente e do contrato.
- **Autoria** (`20261027120000`): `chat_messages` ganha `autor_tipo`/`autor_user_id`/`autor_nome`…; tabela `equipe_identidades` com o WhatsApp pessoal da equipe (cadastrado na aba Assistente, só os 4 últimos dígitos aparecem). "Aguardando resposta" deixa de acender quando a equipe escreve no grupo. Backfill de 90 dias. Equipe só por telefone/LID quando o webhook vem com token.
- **Transcrição de áudio e descrição de imagem** (`20261027130000`): fila `chat_midia_texto`, função `wa-midia-processar` a cada 5 min (Gemini 2.5 Flash via OpenRouter, sem retenção de dados no fornecedor); botão "Ver transcrição" no Chat. Backfill dos áudios de 90 dias.
- **Linha do tempo por cliente** (`20261027140000`): função `cliente_timeline` junta todas as conversas do cliente (grupos e privados, todos os números), sem duplicata, com autor e transcrição. Grupo interno nunca entra (regra dentro do banco).
- **Relacionamento por cliente com memória** (`20261027150000`): `cliente_relacionamento` + histórico; `wa-relacionamento-analisar` (06:00–07:45, Claude Opus 5.5) analisa só quem teve mensagem nova; risco calculado por regra (silêncio ≥ 21 dias, pendência > 5 dias úteis, queda > 60%, insatisfação). **Substitui `wa-auto-satisfacao`** (o job antigo é desagendado). Demora da equipe deixa de contar como insatisfação.
- **Íris:** ferramenta nova `historico_cliente`; `buscar_contato`, `satisfacao_lista` e `resumo_conversa_contato` passam a juntar o mesmo grupo de vários números e a ler por cliente.
- Custo estimado (plano): análise por cliente ≈ US$ 90–125/mês (contra US$ 150–180/mês da análise antiga, que lia quase só leads); áudio < US$ 2/mês; imagem < US$ 1/mês; backfill único ≈ US$ 25 + < US$ 10 de áudio.
- Pendente: dono cadastrar o WhatsApp pessoal da equipe; revisar os grupos na aba Vínculos; calibração F6 (conjunto-ouro de ~30 clientes rotulados).

---

## 2026-10-27 — Íris (assistente da equipe no WhatsApp), aprendizado e relatório por estrategista

- **Assistente da equipe** (antes "Anah", agora **Íris**, nome configurável): responde perguntas da equipe sobre clientes, contratos, comissões, equipe, atendimento, satisfação e reuniões. Claude Opus 5.5 via OpenRouter. Migrations `20261027090000` (base) e `20261027091000` (boas-vindas); funções `wa-agente-responder` e `wa-agente-admin`.
- **Só no grupo interno "Report Entregas"**, quando chamada (@menção, resposta a uma mensagem dela ou o nome no começo da frase). **Nunca no privado**: o número que ela usa também atende clientes. Grupo com "Todos no grupo veem tudo" (`acesso_total`).
- **Webhook protegido**: cada número ganha um token no endereço (`/uazapi-webhook/k/<token>`, botão "Proteger conexão"); sem token a mensagem é gravada no Chat, mas a Íris não é acionada. Fila `wa_agente_pedidos` (sem resposta duplicada) e log sem conteúdo `wa_agente_execucoes`.
- **Aprendizado** (`20261027101000`): a equipe ensina preferências pelo WhatsApp ("responda mais curto"); ficam em `wa_agente_aprendizados` (até 50 ativas), sempre abaixo das regras de segurança, e aparecem em "O que a Íris aprendeu" (aba Assistente). Risco aceito pelo dono: no grupo de acesso total **qualquer pessoa do grupo** ensina preferências e ajusta o aviso diário.
- **Relatório diário** (`20261027100000`, pedido do Sandro): às 08:00 no grupo interno, separado por estrategista e só com clientes ativos. Seções novas: "Clientes insatisfeitos" (IA), "Clientes em risco" (regras) e "Grupos ativos sem cliente vinculado", com link para a aba Vínculos; no painel "Pontos de atenção", alerta `grupo_sem_cliente` por grupo.
- Correções: chave do OpenRouter com quebra de linha (401), anti-duplicação, e-mail/CPF mascarados na saída.

---

## 2026-10-26 — Segurança do Chat, grupos internos restritos, satisfação por IA e relatório em grupo

**Segurança (problemas pré-existentes, corrigidos e aplicados em produção em 26/10/2026):**
- `chat_contacts` era legível sem login (829 contatos de todas as empresas) → política RESTRICTIVE nega `anon` (migration `20261026255000`).
- Bucket `chat-media` listável sem login (11.790 arquivos) → listagem pública removida; URLs públicas continuam abrindo (`20261026257000`).
- `uazapi-actions`: qualquer usuário logado (inclusive cliente do portal) agia em qualquer número de qualquer empresa (ex.: redirecionar webhook) → permissão por perfil e empresa, deny-by-default, webhook só para o próprio projeto.
- `chat-api` lia todas as empresas → filtrada pela empresa da chave. `uazapi-send-message` confere se o usuário vê a conversa.
- **Grupos internos** (que recebem o relatório) visíveis só para admin e gerente: `chat_contacts.restrito_admin`, 14 políticas RESTRICTIVE, push filtrado, RPC de não lidas filtrada (`20261026260000`).
- Pendente (fora do código): trocar os tokens UAZAPI das instâncias Cami e DESK que estão em `docs/integracoes/uazapi.md` e remover os valores do documento.

**Automações WhatsApp:**
- Análise de satisfação diária por IA (`wa-auto-satisfacao`, Claude Opus 5.5, 07:00–08:45 BRT) alimenta "Clientes insatisfeitos ou em risco" (`20261026240000`).
- Relatório diário também para **grupo interno** (só grupo sem vínculo/nome de cliente, com confirmação) (`20261026250000`).
- Diagnóstico: `ia-weekly-analysis` não roda desde 09/10 porque só analisa clientes atribuídos a estrategista e grava sem `tenant_id`.

---

## 2026-10-26 — Automações WhatsApp: alertas inteligentes, painel "Pontos de atenção" e Claude

- **Filtros automáticos no relatório do gestor**: saem contatos bloqueados, grupos sem cliente, conversas silenciadas, clientes inativos, contratos encerrados/fora do prazo e cliente repetido; "sem resposta" só olha a janela recente (padrão 7 dias, `janela_dias`) e o resto vira uma linha "+ N paradas há mais tempo". No tenant de teste: sem resposta 195 → 38, pendências 70 → 13, queda 31 → 6.
- **Painel "Pontos de atenção"** (`/automacoes-wa/alertas`): por alerta, Resolvido / Silenciar (7 dias, 30 dias, até o cliente escrever) / Não alertar mais (com motivo); seção "Silenciados" com "Voltar a alertar". Tabela `wa_auto_alertas_ignorados` (migration `20261026230000`, aplicada; só admin grava; trigger confere empresa e carimba autor). Ação `listar_alertas` em `wa-auto-backtest`.
- Link do painel no fim do relatório (env `APP_URL=https://desk.omnx.pro`).
- **IA**: mensagens da UAZAPI com `anthropic/claude-sonnet-5.5` (esforço baixo) e resumo semanal com `anthropic/claude-opus-5.5` (esforço médio), via OpenRouter; trocáveis por `WA_IA_MODELO_MENSAGENS` / `WA_IA_MODELO_RESUMO` (só aceita modelos Claude).
- Auditoria delta: sem bloqueantes; nível de permissão alinhado em admin, trava anti-sondagem no trigger, lista de modelos permitidos.

---

## 2026-10-26 — Automações WhatsApp: tela de configuração refeita (UX)

O dono achou a configuração confusa. Duas revisões de UX (fluxo e textos) e reimplementação:
- Abas na ordem do trabalho: **Início · Conexão · Relatório diário · Resumo semanal · Reuniões · Histórico** (Gestores + Alertas viraram "Relatório diário"; Agendamento virou "Reuniões"). Rotas antigas redirecionam.
- **Início** novo: "Primeiros passos" com o que falta e cartões de cada automação (ligada/desligada, próximo e último envio, motivo quando não vai sair).
- Fim das falhas silenciosas: não dá para ligar o relatório sem gestor/conexão; resumo "no grupo" desabilitado no WhatsApp Oficial; aviso quando falta o número para o link de reunião.
- Linguagem simples ("WhatsApp do Chat" / "WhatsApp Oficial", "textos aprovados pela Meta"), menos avisos amarelos, "✓ Salvo" nos campos que salvam sozinhos, foco visível e contraste.
- Teste de envio sem digitar valores: o servidor preenche os exemplos (`wa-auto-testar-envio`, publicada).

---

## 2026-10-26 — App Automações WhatsApp: envio, relatório, resumo e agendamento (etapas 9.2 a 9.5)

Backend completo do app, **tudo desligado por padrão** em cada empresa (nada é enviado até o admin ligar na tela).

- 9.2 — Adaptador de envio UAZAPI/Zernio (`_shared/wa-provider.ts`), tokens no Vault, endereço da API só `*.uazapi.com`/`*.zernio.com`, disjuntor e função `wa-auto-testar-envio` (migration `20261026140000`).
- 9.3 — `wa-auto-relatorio-diario` (cron a cada 15 min) e `wa-auto-backtest` (prévia sem enviar, só admin). Alertas: sem resposta, sentimento negativo, pendência, queda de volume + reuniões do dia (migration `20261026160000`: segredo do cron no Vault, limpeza de histórico após 90 dias).
- 9.4 — `wa-auto-resumo-semanal` (privado de cada gestor ou grupo do cliente; migration `20261026170000`).
- 9.5 — `wa-auto-agendar`: Etapa 1 marca a reunião sem link; Etapa 2 envia o link ao grupo uma única vez, pela UAZAPI (migration `20261026180000`, índice único por reunião).
- Auditoria `/security-auditor` (delta): sem bloqueantes. Corrigidos reprocessamento da IA a cada 15 min, prévia sem empresa, e reenvio após 90 dias. Todas as migrations e funções já estão em produção.
- Correção de requisito: o resumo SEMANAL é para o CLIENTE (grupo dele ou conversa privada dele), só com assuntos e próximos passos confirmados pela equipe, sem risco/clima e sem promessa comercial (filtro + prompt). O relatório DIÁRIO é o do gestor.
- Gestão de modelos oficiais (templates) pela Zernio: função `wa-auto-templates` (listar, consultar status, criar a partir de um catálogo fixo de 3 modelos) e seção "Modelos aprovados" na aba Conexão (migration `20261026200000`). Só liga aos envios um modelo aprovado com texto idêntico ao catálogo.
- Front: prévia do relatório (aba Alertas), fluxo real de agendamento em 2 etapas, textos das abas corrigidos.
- Segunda e terceira auditorias delta (resumo ao cliente e templates): sem bloqueantes; achados corrigidos antes de publicar. Tudo publicado em produção; typecheck sem erros novos (190 antigos), 237 testes passando.
- Teste automatizado de isolamento com 2 empresas em produção (74 casos, transação desfeita): sem vazamento. Achou e corrigiu o CHECK inválido do nome em `wa_auto_modelos` (`{0,511}` não é aceito pelo Postgres) e retirou TRUNCATE de anon/authenticated (migration `20261026210000`). Tipos do Supabase regerados; `as any` da automação removidos (typecheck 189, antes 190).
- Pendente: o Bruno colar a chave e o `accountId` da Zernio; criar os modelos pela tela e aguardar aprovação da Meta; homologação e teste com 2 empresas.

---

## 2026-10-26 — App Automações WhatsApp: fundação (etapa 9.1)

Novo app `automacoes-wa` na Loja de Apps, com área própria de configuração (só admin):
abas Gestores, Conexão, Alertas, Resumo semanal, Agendamento e Histórico. Entrega só
a configuração: **nada é enviado ainda** (o envio vem nas etapas 9.2 a 9.5, ver
ROADMAP-MODULARIZACAO Fase 9).

Banco (migration `20261026120000`, aplicada em produção em 26/10/2026): tabelas
`wa_auto_config`, `wa_auto_gestores` (limite de 10 por empresa), `wa_auto_regras_anomalia`
e `wa_auto_envios` (histórico, só leitura para o front), todas com `tenant_id`, RLS
RESTRICTIVE e permissão `automacoes-wa`. Tudo nasce desligado. A instância de WhatsApp
escolhida precisa ser da mesma empresa.

Atenção: `seed_app_modules_for_tenant` foi reescrita (acrescenta o app novo) e passou a
ter EXECUTE revogado de `authenticated`, endurecendo a decisão anterior do Grupo B de
`20260804212000`. Os gatilhos de `tenants` e o `provision-tenant` (service_role) não
são afetados.

Reversão: `DROP TABLE` das 4 tabelas `wa_auto_*` (CASCADE) e `DELETE` do app em
`app_modules`.

---

## 2026-09-18 — Contratos assinados: destinatários da operação principal

Os avisos de contrato assinado do tenant mestre agora seguem em cópias
individuais para Bruno, `highticket@marvee.com.br` e
`exosconsultoria@marvee.com.br`, com os mesmos anexos. A edge function passou a
aceitar apenas o gatilho interno autenticado por segredo; assim, usuários do
aplicativo não conseguem disparar avisos de contratos de outra empresa.

---

## 2026-09-12 — Entrada pelo Empire OS sem senha compartilhada

`provision-tenant` agora apenas cria/reconcilia o tenant e o vínculo de administrador;
não gera nem retorna magic link. O dono entra pelo provedor OIDC `custom:empire-os`, com
o mesmo e-mail e senha validados no Empire OS, e recebe sessão somente no tenant ligado
ao `external_ref` provisionado. Nenhuma senha é copiada ou retornada.

O frontend deixou de carregar uma chave pública hardcoded como fallback: URL e chave
publicável/anon agora são obrigatoriamente fornecidas pelo ambiente. `vite`, `sharp`,
`csv-parse` e transitivas foram atualizados; 79 testes e o build passaram.

Os links de notificação, que vêm do banco, agora passam por `safeInternalRoute` antes
do React Router. URL externa, `javascript:`, destino protocol-relative, barra invertida,
caractere de controle e separador codificado são recusados. Isso fecha o caminho real dos
dois avisos moderados ainda reportados para o React Router 6 sem exigir a migração
incompatível para a versão 7.

---

## 2026-09-11 — Onboarding com as duas datas + admin que também é estrategista

**Onboarding.** Cada venda mostrava só "enviada em", e a equipe confundia a
entrada do lead com a assinatura — que é o que deixa o contrato ativo (gatilho
do Clicksign). Agora lista e detalhe mostram **"Lead entrou"** (`criado_em` da
venda) e **"Assinou"** (`contratos.data_assinatura` do contrato ligado por
`venda_pendente_id`), ou "ainda não assinou".

**Admin estrategista.** O perfil é um só; promover um estrategista a admin o
tirava da lista de estrategistas do Chat e da tela de Acessos. As duas telas
passam a considerar admin com cliente vinculado como estrategista
(`client_assignments`), igual já acontecia com gerente. Vínculos e comissões
nunca dependeram do perfil.

---

## 2026-08-19 — Incidente: a segunda empresa derrubou o chat (e mais 14 tabelas)

**O que o usuário viu.** "Falha ao enviar: null value in column tenant_id of
relation chat_messages violates not-null constraint". A mensagem *chegava* no
WhatsApp do cliente, mas não aparecia na tela — a função envia primeiro e grava
depois, e era a gravação que morria. Pior e invisível: o webhook parou de gravar
as mensagens **recebidas**, sem erro em tela nenhuma.

**A causa.** O carimbo automático de empresa (`set_tenant_id` ->
`resolve_tenant_default()`) resolve assim: empresa do usuário logado; sem sessão
(service_role / edge function), cai no tenant único do banco. Esse fallback só
vale enquanto existe **exatamente um** tenant. O provisionamento criou a segunda
empresa em **19/08 às 16:18:44 UTC** — e a última mensagem que o sistema
conseguiu salvar foi **16:18:14 UTC**, trinta segundos antes. A partir dali,
toda escrita sem sessão recebia NULL numa coluna NOT NULL.

O bug estava plantado desde a Fase A do multi-tenant; a segunda empresa só puxou
o gatilho.

**A correção, em duas camadas.**

*No banco* (`20260819190000_chat_herda_tenant_do_pai.sql`): a linha herda a
empresa do registro pai — a mensagem da conversa, a conversa da instância de
WhatsApp. Determinístico, não depende de sessão, vale para qualquer caminho de
escrita. Cobre 15 tabelas, porque o problema nunca foi só do chat: notificações,
cobrança, logs de webhook, aquecimento, extração de PDF e outras iam quebrar
igual assim que fossem exercitadas.

*Fila de e-mail e venda pública* (`20260819200000_email_queue_e_vendas_publicas_tenant.sql`):
essas duas não têm pai único. A fila resolve pela referência (contrato/venda),
depois pelo destinatário; a venda pública pelo produto, depois pelo closer. Cada
uma com fallback ao tenant mais antigo — adivinhação, sim, mas melhor que perder
uma venda já preenchida ou travar e-mail transacional. A correção definitiva da
venda pública é o formulário informar de qual empresa ele é.

*No código* das edge functions do chat (`uazapi-send-message`, `uazapi-webhook`,
`ia-bot-respond`): passam a informar a empresa explicitamente em vez de contar
com a dedução do banco. **Ainda não deployado** — `uazapi-send-message` exige
`--no-verify-jwt`, e um deploy errado derruba o chat com 401.

**Estrago.** 772 eventos de webhook (≈488 mensagens distintas) de clientes
perdidos entre 13:18 e 18:59 BRT — recuperáveis a partir de `_webhook_debug`,
que guardou o payload bruto. **Atenção ao reprocessar:** reenviar os webhooks
faria o bot de IA responder todos os clientes com mensagens de horas atrás e
dispararia centenas de push. O resgate tem que ser gravação direta no banco.
Nenhum e-mail de contrato assinado e nenhuma venda pública se perderam na janela.

**Lição.** Todo fallback do tipo "se só existe um X, use esse" é uma bomba com
temporizador: funciona até o dia em que existirem dois. Fallback assim precisa
de alarme, não de silêncio.

---

## 2026-08-06 — Fecha as pendências da reestruturação (§5, §6, §8–9, §14, §15, §19)

**O pedido.** Executar de uma vez as frentes que o roadmap listava como abertas,
mais uma adição: a análise sentimental, que só existia numa aba do Dashboard
legado, precisava aparecer no Atendimento.

**Aba Sentimental no Atendimento** (`/atendimento/sentimento`). É a **mesma**
tela do relatório semanal, não uma cópia — duplicar significaria duas versões
divergindo. Só aparece se o app de Chat estiver ligado e a pessoa puder vê-lo: é
dele que vêm as conversas analisadas.

**Ramo da empresa saiu do Atendimento e foi para Configurações.** É dado da conta,
como marca e logo — não preferência de um app. Quem procurava "onde mudo o ramo?"
ia primeiro em Configurações, como manda a intuição. Ficou um ponteiro na
configuração do Atendimento para quem já conhecia o caminho antigo.

**Ficha do cliente virou visão 360 (§6).** Três abas novas — **Financeiro**
(parcelas vencidas e a vencer, calculadas pela mesma função da tela de
Recebíveis), **Conversas** e **Demandas**. Cada aba é um índice que leva ao app
dono do dado; reimplementar a operação de cada módulo ali criaria uma segunda
versão de cada tela.

**Reporte de erro agora avisa a equipe (§14).** Trigger em `reportes_erro` chama
a `send-email`, um e-mail por admin do **mesmo tenant**. Só categoria `bug` —
dúvida e sugestão não acordam ninguém, senão o alerta vira ruído e ninguém lê. O
print, o console e a rede **não** vão no e-mail: ficam no painel, atrás da RLS.

**Os gates `admin || gerente` viraram permissão editável (§15).** Três recursos
novos: `clientes.carteira` (ver todos os clientes), `chat.carteira` (ver todas as
conversas) e `clientes.atribuir` (definir responsável). Semeados exatamente para
quem já tinha — **ninguém ganhou nem perdeu acesso**. `atendimento` entrou só na
primeira, porque já via todos os clientes mas não todas as conversas: um recurso
único para os dois casos teria ampliado o acesso dele sem ninguém pedir. O ganho:
delegar deixou de exigir promover alguém a administrador.

**Observabilidade (§19).** Tabela `app_logs` por app, captura global de exceção,
promessa rejeitada e falha de query/mutação, e painel **`/saude`** com erros por
app em 24h/7d/30d. Antiflood de 30s por evento — sem ele, um erro dentro de um
render em loop escreveria milhares de linhas em segundos.

**UX de Chat e Contratos (§8–9).** Auditoria em
`docs/reestruturacao/AUDITORIA-UX-CHAT-CONTRATOS.md`. Achado principal: quatro
áreas do Chat não tinham entrada no menu — só abriam digitando a URL. Por decisão
do dono, foram **removidas** (Relatórios, Conteúdo, Automação, Campanhas), com os
hooks que ficaram órfãos. Nenhuma tabela foi apagada e o relatório Sentimental
foi preservado. Em Contratos, as 7 abas viraram dois grupos separados por
divisória: trabalho e configuração.

⚠️ **Consequências assumidas da remoção:** respostas rápidas e templates
continuam aparecendo na conversa, mas não há mais tela para cadastrá-los; e um
bot ativo continua respondendo pela edge function, sem tela para desligar —
conferir antes do deploy.

**Documentação (§5) fechada.** Entraram `MANUAL-DO-USUARIO`,
`MANUAL-DE-ADMINISTRACAO`, `GUIA-DE-SUPORTE`, `ESTRATEGIA-DE-ROLLBACK` e
`PLANO-DE-HOMOLOGACAO`.

**Migrations:** `20260806120000` (e-mail de reporte), `20260806130000`
(permissões de carteira), `20260806140000` (app_logs + `resumo_saude_apps`).

**Fica aberto:** testes (§16–17) — 63 testes, todos unitários, sem E2E e sem
teste de isolamento entre empresas — e fatiar a `ConversationView` (3.217 linhas,
68 botões).

---

## 2026-08-06 — Recebíveis: agenda de recebimentos do dia

**O pedido.** A aba Recebíveis respondia "quanto entra em agosto", mas não "quanto entra **no dia 8**". Para saber quem paga numa data específica era preciso abrir mês a mês e ler a lista inteira.

**A entrega — painel "Recebimentos do dia"** em `/contratos/recebiveis`, entre os KPIs e o gráfico:

- Data escolhida por campo de data, setas `‹ ›` para andar dia a dia e botão "Hoje". Abre no dia de hoje.
- **Atalhos dos próximos dias com entrada** (10 primeiros), cada um com valor e número de parcelas — dá para pular direto para o próximo dia em que cai dinheiro.
- Lista de quem vence naquele dia (cliente, produto, valor); o clique abre o contrato. Navegável por teclado.
- **Total do dia** em faixa própria, com contagem de parcelas e de clientes.
- Estado vazio com atalho para o próximo dia que tem recebimento.

**Duas regras que diferem do resto da tela:**

1. A agenda diária **também enxerga datas passadas** — serve para conferir "o que era para cair ontem?". O restante da tela continua só olhando para frente (`>= hoje`).
2. O filtro de **Período (mês) não se aplica** à agenda, já que o dia escolhido é o próprio recorte; caso contrário, escolher um dia fora do período mostraria vazio sem motivo aparente. Os filtros de cliente, tag, estrategista e produto continuam valendo.

**Código.** `parcelasFuturasDoContrato` passou a ser um filtro sobre `parcelasDoContrato` (nova), que devolve o cronograma inteiro sem corte de data — mesma regra de sempre: entrada/sinal fora, só contrato ativo. Novos utilitários `somaDias`, `rotuloDia` e `rotuloDiaExtenso`. `fluxoFuturo.test.ts` foi de 5 para 9 testes.

## 2026-08-04 (noite) — Contrato do Desk chega ao CRM + faxina em Contratos

**Ponte de contrato.** O dashboard do CRM listava como "sem contrato assinado" vendas cujo contrato estava **ativo** aqui. O CRM não recebia nada sobre contratos — só via a etapa do card no funil, que não muda quando o contrato é fechado fora do Clicksign (eram 17 contratos ativos sem link).

- `_shared/sincronizar-venda.ts` busca o contrato da venda (`contratos.venda_pendente_id`) e envia `{ status, link_assinatura, data_assinatura }` no payload.
- `trg_contrato_ressincronizar_venda_crm` (migration `contrato_ressincroniza_venda_crm`): mudou status/link/data de assinatura → reenvia a venda ao CRM. Mesmo disjuntor `app.skip_venda_resync`.
- **Backfill do vínculo:** só 8 de 25 contratos tinham `venda_pendente_id` (o gatilho que preenche é recente). Religados **15**, casando por CPF/CNPJ e nome — todos com match único de ambos os lados, conferido antes de escrever. Depois disso, 20 vendas do Desk passaram a chegar ao CRM com contrato ativo.

**Duplicatas mescladas.** Varredura em 331 contratos encontrou **duas** duplicatas — Daniela Espinoza e Erick Oliveira —, ambas do mesmo padrão: um rascunho vazio criado pelo gatilho da venda + o contrato real, ativo e assinado. Mantido o ativo, que herdou o `venda_pendente_id`; o rascunho foi apagado. **As duas datas ficaram preservadas** (pagamento era idêntico nos dois; assinatura só existia no ativo) e nenhuma comissão estava atrelada.

**Data de pagamento em Contratos.**
- Campo editável no detalhe, ao lado do status e da data de assinatura.
- `tg_set_data_pagamento` **parou de desfazer edição manual** (migration `data_pagamento_respeita_edicao_manual`): antes recalculava a partir do cronograma em toda gravação, então o campo novo seria inútil. Agora só age quando a data está vazia ou quando o próprio cronograma mudou.
- Coluna na listagem e **ordenação padrão da lista** por ela; contrato sem data vai para o fim nos dois sentidos.
- **Tabela sem scroll lateral:** `table-fixed` com larguras percentuais, truncamento, colunas que somem por breakpoint (produto, assinatura, parcelas), coluna **%** removida a pedido do dono, e rodapé tirado do `tfoot` — com colunas ocultas, o `colSpan` desalinhava do valor.

**Migrations resgatadas para o repositório.** As três mudanças de banco desta noite tinham sido aplicadas direto pela Management API e só existiam no servidor — o histórico do repo não reproduzia mais o banco, e o campo novo de data de pagamento dependia justamente de uma delas. Foram extraídas do banco (`pg_get_functiondef`) e versionadas em `supabase/migrations/`: `..214000_venda_ressincronizar_crm_trigger`, `..215000_data_pagamento_respeita_edicao_manual` e `..216000_contrato_ressincroniza_venda_crm`. Todas idempotentes (`create or replace` + `drop trigger if exists`), então reaplicar é inofensivo.

**Correções de tipo.** `sincronizacao_erro` existia na tabela `vendas_pendentes` mas faltava na interface `VendaPendente` — a tela que passou a exibir o erro do último envio não compilava. Removida também a função `dataBR`, que ficou órfã quando as datas viraram campos editáveis.

## 2026-08-04 (noite) — Venda editada no Desk agora atualiza o CRM na hora

**O sintoma.** O faturamento de julho no dashboard do CRM não batia com a planilha de vendas.
Investigando o caso do **Thiago Muniz**: o CRM mostrava R$ 84.000 e o Desk, R$ 24.000.

**A causa.** O envio ao CRM só acontecia no clique do botão ("Concluir + CRM" / "Enviar ao CRM
agora"). Depois disso, **nenhuma edição era propagada** — e a tela ainda escondia o bloco de
sincronização de quem já tinha sido enviado, então não havia nem caminho manual de correção.
No histórico da venda do Thiago: sincronizada em 03/07 às 12h30 com 12 pagamentos (R$ 84.000)
e editada às 12h54 para 2 pagamentos (R$ 24.000). O dashboard exibiu o número velho por mais
de um mês, inflando julho em R$ 60.000.

**A entrega — sincronização automática, sem botão** (decisão do dono: "mudei qualquer número lá,
já muda também"):

- **`_shared/sincronizar-venda.ts`** — a montagem do payload, os links assinados dos comprovantes,
  o POST na ponte e a gravação do resultado saíram da edge function e viraram helper. As duas
  portas usam o mesmo código: duplicar era garantia de divergir de novo.
- **`vendas-ressincronizar-crm`** (function nova) — autenticada só por `x-notify-secret` do Vault,
  como a `empire-contrato-assinado-ghl`. Não recebe oportunidade: usa o `ghl_oportunidade_id` já
  gravado, então um reenvio **nunca** escolhe um card diferente do que uma pessoa vinculou.
- **`trg_venda_ressincronizar_crm`** (migration `20260804190000`) — AFTER UPDATE em
  `vendas_pendentes`. Só dispara quando a venda **já está vinculada** e quando muda algum dos 16
  campos que vão ao CRM. Esse recorte é o que evita laço infinito: o próprio UPDATE de controle da
  função (`sincronizado_em`, `ghl_venda_id`, `sincronizacao_erro`) não redispara o trigger.
  Disjuntor para lotes: `SET LOCAL app.skip_venda_resync = 'on'`.
- **Tela** — a venda sincronizada agora avisa "Qualquer alteração feita aqui é enviada ao CRM na
  hora" e mostra o erro do último envio automático quando houver. Sem botão de reenvio.

**Idempotência:** do lado do CRM, `crm-registrar-venda` faz UPSERT por `oportunidade_id` — reenviar
atualiza a venda existente, não duplica.

**Validado em produção (04/08/2026):** reenvio disparado nas vendas da Daniela Espinoza e do Erick
Oliveira → HTTP 200 nas duas, valores preservados e **os comprovantes que faltavam (1 e 3) subiram
para o CRM**. Depois, uma edição real numa venda vinculada disparou o trigger sozinha (request
`24460`, HTTP 200), sem erro registrado.

---

## 2026-08-04 (noite) — Telas em branco: 3 variáveis inexistentes e o type-check que não checava

**O sintoma.** Configurações, Dashboard de Contratos e Colaboradores abriam em branco,
com `Uncaught ReferenceError: can is not defined` no console.

**A causa.** O refactor de permissões (`8d5d5cc`) trocou `user?.perfil === 'admin'` por
`can('recurso', 'admin')` em 15 telas. Em três arquivos o `can` foi usado num
componente que não o criava: ou o `usePermissoes()` estava em **outro componente do
mesmo arquivo** (Configurações, Dashboard de Contratos), ou o hook nunca foi importado
(Colaboradores). Como `can` não existe naquele escopo, a tela morre no primeiro render.

**A causa da causa — e a correção mais importante desta entrega.** O `CLAUDE.md`
mandava validar com `npx tsc --noEmit` antes de commitar. Só que o `tsconfig.json` da
raiz é um índice (`"files": []` + `references`): esse comando **compila zero arquivo e
sai com sucesso sempre**. O bug passou por um type-check "verde" que não olhou nada. O
`npx vite build` também não pega: o Vite transpila sem checar tipos.

O comando correto — `npm run typecheck` (`tsc -b`), que já existia no `package.json` —
apontou os três erros na hora, incluindo **um quarto ponto que ninguém tinha visto**:
`onCobrar` era usado no `SocialCard` da tela de Clientes sem estar na desestruturação
dos props (existia na interface e o pai passava). Mesmo destino: `ReferenceError` ao
clicar em cobrar.

**Corrigido:** os quatro pontos (`ConfiguracoesPage`, `ContratosDashboardPage`,
`ColaboradoresPage`, `ClientesPage`) e o `CLAUDE.md`, que agora manda `npm run
typecheck` e explica por que o comando antigo enganava.

**O que ficou exposto e NÃO foi corrigido.** Com o type-check funcionando de verdade,
apareceram 222 erros de tipo; corrigidos os 4 desta entrega, sobram **218
pré-existentes** — a maioria em `useChat.ts`,
`useComissoes.ts` e `useCobranca.ts`, e boa parte é a mesma família: depois que a Fase
A.2 tornou `tenant_id` NOT NULL, os tipos gerados passaram a exigir o campo em todo
`insert`, mas o código conta com o gatilho do banco para carimbá-lo. Nenhum desses é
erro de execução (o Vite ignora tipos e o gatilho preenche), mas enquanto existirem o
type-check não serve de portão. Fica registrado como dívida.

---

## 2026-08-04 (noite) — Faxina de permissões: trava do Atendimento e RPCs fechadas

Auditoria de acompanhamento depois que a Fase C subiu. As migrations da Fase C
estavam todas aplicadas em produção (conferidas policy por policy, não só pelo
registro na tabela de migrations). Três correções entraram.

**1. O app de Atendimento ganhou o cinto de segurança que faltava**
(`20260804210000`). As 5 tabelas do app (`atendimento_demandas`, `_tipos`,
`_etapas`, `_comentarios`, `_historico`) nasceram com o filtro de empresa dentro de
cada policy PERMISSIVE. Isolava — mas policies PERMISSIVE se somam com **OU**:
bastava alguém criar amanhã mais uma policy sem o filtro para o isolamento cair
sozinho. Agora as 5 têm a policy RESTRICTIVE `tenant_isolation`, que entra em **E**
com todas as outras. São **105 tabelas** com a trava. Nada mudou para quem usa hoje:
a condição já era exigida.

**2. Funções internas deixaram de ser endpoint público** (`20260804212000`). Toda
função no schema `public` vira automaticamente uma rota `/rest/v1/rpc/<nome>`. Como
`SECURITY DEFINER` roda com os privilégios do dono e ignora RLS, havia 110 funções
alcançáveis de fora — incluindo `aprovar_extrato_mes`, `calcular_comissoes_contrato`
e dezenas de funções de gatilho, que nem fazem sentido como rota. Foram separadas em
três grupos: as de gatilho perderam o acesso de todo mundo; as RPCs de negócio
perderam o acesso anônimo (seguem disponíveis para quem está logado e para as edge
functions); e as funções usadas **dentro das próprias policies** (`is_admin`,
`has_permissao`, `get_user_tenant_id`, `get_tenant_by_domain`...) foram deixadas
como estavam de propósito — revogar ali faria o acesso anônimo estourar com erro em
vez de simplesmente não devolver linha, e derrubaria a marca por domínio na tela de
login.

Antes de aplicar, a dúvida que decidia o desenho foi testada em laboratório
(tabela + gatilho descartáveis): **revogar `EXECUTE` de uma função de gatilho não
impede o gatilho de disparar** — o Postgres cobra esse privilégio ao criar o
gatilho, não a cada disparo.

**3. `search_path` fixo em 8 funções** (`20260804211000`). Sem isso, quem chama a
função pode colocar um schema próprio na frente do `public` e fazer a função
resolver uma tabela falsa. Usamos `public, pg_temp` em vez de vazio porque duas
delas referenciam objetos sem qualificar o schema.

**Resultado.** Os alertas de segurança do Supabase caíram de **129 para 71**, sem
nenhum ERROR antes ou depois. O que restou é o grupo mantido de propósito, duas
extensões no schema `public` e a proteção contra senha vazada, que se liga no painel
do Auth (Authentication → Policies) e não depende de código.

**Verificação.** Com sessão de admin real: leitura (331 contratos), escrita com
gatilho carimbando data, e criação de demanda no Atendimento com a empresa certa —
tudo dentro de transação revertida, sem tocar em dado de produção.

---

## 2026-08-04 (fim de tarde) — Fase C do multi-tenant: teste com empresa real e 6 furos fechados

**O que foi feito.** Criamos uma segunda empresa de verdade no banco, com admin
próprio, logamos com ela pela API real e perguntamos tabela por tabela (todas as 103)
"o que essa pessoa consegue ver?". Depois testamos escrita, arquivos e o caminho
inverso. A empresa de teste foi apagada no fim; as contagens da Aliança foram
conferidas antes e depois (333 contratos, 339 clientes, 1030 comissões, 35 usuários).

**O que já estava certo.** 91 tabelas seguraram — contratos, comissões, chat,
clientes, vendas, entregas. A empresa nova viu **zero** linha da Aliança nelas, e o
que ela criou nasceu carimbado com a empresa certa sem precisar informar nada.

**Os 6 furos encontrados e fechados.** Todos pela mesma causa: essas tabelas nunca
receberam a trava `tenant_isolation` que as outras 91 têm.

| Onde | O que dava para fazer |
|---|---|
| `employees` | Ler os 32 colaboradores da Aliança (e-mail corporativo, cargo) **e editá-los** |
| `company_areas` | Ler **e editar** a estrutura de áreas |
| `positions`, `subareas` | Ler cargos e subáreas |
| `profiles` | Ler nome e e-mail de todo mundo |
| `tenant_integracoes` | Ler a configuração da ponte com o CRM |
| `tenants` | Listar todas as empresas; e qualquer admin podia reescrever a marca (nome, cores, logo, domínio) de **qualquer** empresa |

**Arquivos.** Um comprovante de venda "órfão" — o arquivo ficou no bucket depois que
o registro sumiu — foi **baixado** por outra empresa. A regra antiga dizia "se eu não
descobrir de quem é o arquivo, libera"; agora só libera para quem subiu. Os buckets
`deliveries` e `pj-notas` não tinham trava nenhuma e passaram a ter.

**Dois bugs que só apareciam com 2 empresas.** Ficavam invisíveis enquanto existia
uma empresa só:

1. O resolvedor automático de empresa tinha um atalho — "se só existe uma, usa ela".
   Com a segunda criada, toda gravação sem usuário logado (edge function, automação,
   gatilho em cascata) passou a falhar. Bateu na hora ao promover alguém a admin.
   Agora as 11 funções internas carimbam a empresa explicitamente, a partir da própria
   linha de origem.
2. Criar usuário sem informar a empresa jogava a pessoa **dentro da Aliança**. Agora
   isso só é aceito se a instância tiver uma empresa só; com duas ou mais, o cadastro
   falha com mensagem clara em vez de acertar a empresa errada.

**De quebra.** As funções que montam os grupos internos de departamento liam usuários
de **todas** as empresas — com duas ativas, admins de uma entrariam nos grupos da
outra. Corrigido junto.

**Empresa nova nasce completa.** Como o organograma deixou de ser compartilhado, o
seed passou a clonar áreas, subáreas e cargos do mestre para a empresa nova (cópia
própria, editável sem afetar ninguém).

Migrations: `20260804120000` a `20260804125500`. Detalhes em `docs/multi-tenant-roadmap.md`.

---

## 2026-08-04 (noite) — Atendimento vira a tela inicial e se adapta ao ramo da empresa

**A tela inicial mudou.** Ao entrar no sistema, você cai no **painel de Atendimento**,
não mais no Dashboard. O item no menu ocupa a posição de antes e usa o **mesmo ícone** —
quem já usa procura aquele desenho no topo, e mudar o símbolo de lugar custa mais do que
ganha.

**O Dashboard não foi apagado.** Continua vivo em `/dashboard-legado`, fora do menu. Ele
concentra métricas de contratos, entregas e Instagram que ainda não têm outro lugar, então
apagar seria perder informação sem ter para onde levá-la.

*Rede de segurança:* se o Atendimento estiver desligado nesta empresa, ou se o perfil da
pessoa não tiver permissão nele (um agente de cobrança, por exemplo), a tela inicial cai
no Dashboard legado automaticamente. Sem isso, desligar o app deixaria a empresa sem tela
inicial, e um perfil sem permissão veria um painel eternamente vazio — concluindo que o
sistema quebrou.

**Cada empresa tem o seu ramo.** Agora a empresa escolhe o **segmento** na aba
Configuração, e a interface inteira se adapta:

| | Social Media | Clínica | Escritório |
|---|---|---|---|
| Chama de | demandas | atendimentos | demandas |
| Quem é atendido | cliente | paciente | cliente |
| Abas | Painel, Demandas, Kanban | Painel, Atendimentos | Painel, Demandas, Kanban |
| Métricas de aprovação | sim | não | não |
| Etapas semeadas | Solicitado → … → Publicado | Agendado → … → Concluído | Recebida → … → Concluída |

A clínica não tem kanban de propósito: o fluxo é curto e a lista com filtro dá conta —
aba a mais é aba que ninguém abre. E não tem "aguardando aprovação do cliente", porque
paciente não aprova peça.

Trocar o ramo é **aditivo**: as etapas e tipos do ramo novo são acrescentados, nada do que
já existe é apagado. Se houvesse remoção automática, uma demanda parada numa etapa antiga
viraria trabalho órfão. O admin apaga à mão o que não usa — e o banco recusa apagar etapa
que ainda tem demanda dentro.

*Onde isso mora:* `tenants.atendimento_segmento` (não numa tabela de config do app), porque
é característica da empresa — se outro módulo precisar saber o ramo do cliente, já está lá.
O catálogo de ramos vive em `src/lib/atendimentoSegmentos.ts`; acrescentar um novo é uma
entrada no arquivo e um valor no CHECK da coluna, sem `if` espalhado pelas telas.

**A seção "Apps arquivados" saiu da tela.** Cobrança e Portal continuam desligados no
banco (rotas bloqueadas, dados intactos), mas não aparecem mais em `/apps`. Religar um
deles hoje exige mexer no banco de propósito — não é operação de rotina.

Migrations: `20260804180000` (segmento + seed por ramo), `20260804190000` (ícone e
Dashboard legado).

---

## 2026-08-04 (tarde) — App Atendimento (Social Media) e catálogo de apps enxuto

**O que mudou para quem usa.** A tela `/apps` deixou de listar 5 aplicativos e passa
a listar **3**: OMNXChat, Atendimento e Contratos. O Dashboard saiu da lista porque
virou parte do núcleo — é a tela inicial, desligá-la deixaria a pessoa sem para onde
ir ao entrar. Cobrança e Portal do Cliente foram **arquivados**: somem do menu e das
URLs, mas ficam recolhidos numa seção "Apps arquivados" na própria tela, prontos para
religar. Nenhum dado foi apagado.

*Por que o Portal saiu:* checamos no banco antes de mexer. Os únicos 2 usuários com
perfil `cliente` — quem entraria na área externa — são contas de teste do projeto
OMNX-Comissões, e uma delas nunca logou. Não há cliente final usando o Portal hoje.

**App novo: Atendimento.** Primeira versão voltada a **Social Media**, entregando o
que faltava: um lugar para o pedido do cliente existir. Hoje "preciso de 4 reels essa
semana" vive no WhatsApp e some no meio da conversa — sem dono, sem prazo, sem saber
se o cliente aprovou.

| Tela | Para quê |
|---|---|
| **Painel** (`/atendimento`) | O que precisa de atenção agora: atrasadas, vencendo hoje, esperando o cliente, com ajuste pedido, entregues no mês |
| **Demandas** | Lista com busca (título, código `DEM-00012`, descrição) e filtros por etapa, cliente, responsável, prioridade e situação |
| **Kanban** | Arrastar a demanda pela etapa — mesmo padrão do kanban de Contratos |
| **Detalhe** | Responsável, prazo, prioridade, aprovação do cliente, comentários da equipe e histórico |
| **Configuração** (admin) | Etapas do fluxo e tipos de solicitação |

**A decisão que faz o app crescer.** Tipos e etapas são **dados por tenant**, não
código. Trocando esses dois conjuntos, o mesmo app atende uma clínica ou um escritório
sem migration nova — Social Media é só o primeiro conjunto semeado (Reels, Carrossel,
Story, Post único, Campanha, Outro / Solicitado → Em produção → Em revisão interna →
Aguardando aprovação → Aprovado → Publicado).

**Duas coisas que o histórico registra sozinho.** Mudança de etapa, responsável, prazo,
prioridade e aprovação são gravadas por **trigger no banco**, não pela tela. Assim a
trilha vale venha a mudança do detalhe, do kanban ou de uma correção manual. E entrar
numa etapa marcada como *final* carimba a conclusão — voltar para uma etapa de trabalho
limpa o carimbo.

**Dois defeitos encontrados e corrigidos no caminho:**

1. **`has_permissao()` no banco não tinha a escada de ações que o front tem.** A função
   comparava a ação exata, então quem tinha `editar` não passava numa checagem de `ver`
   — enquanto `usePermissoes.can` sempre tratou `editar` como suficiente. Passou
   despercebido porque, até agora, **nenhuma policy chamava a função**: o gate vivia só
   no front. Como o Atendimento é o primeiro app com gate na RLS, isso viraria bug real
   — a matriz de `/admin` grava uma linha por par (perfil, recurso), então marcar
   "editar" apagaria a linha "ver" e derrubaria o acesso de quem acabou de ganhar
   permissão. Alinhado nos dois lados (`20260804160000`).
2. **FKs de usuário apontavam para `auth.users`**, fora do padrão do projeto. O
   PostgREST só monta o join `responsavel:users(nome)` com FK para o schema exposto —
   sem a correção, a tela não teria como mostrar o nome do responsável. Corrigido antes
   de existir qualquer dado.

**Segurança.** As 5 tabelas novas nascem com RLS por tenant; as demandas exigem
permissão no recurso `atendimento` para leitura e escrita — esconder o menu não protege,
a trava está na RLS. O bucket `atendimento-anexos` é privado e isolado por tenant, e a
função nova recebeu `REVOKE ... FROM PUBLIC` explícito (a lição do P0 de 27/07: função
nova no Postgres nasce executável por PUBLIC, e revogar de `authenticated` não tira
esse grant).

**Migrations:** `20260804130000_catalogo_apps_reorganizado`,
`20260804140000_app_atendimento_social_media`,
`20260804160000_has_permissao_escada_de_acoes`, mais o ajuste das FKs. Aplicadas via
Management API e conferidas no banco (catálogo por tenant, RLS ativa nas 5 tabelas,
12 tipos e 12 etapas semeados nos 2 tenants).

**Ainda não entrou:** upload de anexo pela tela (bucket e coluna já existem), criar
demanda a partir de uma conversa do Chat, métricas do Instagram no painel e reordenar
etapas por arraste.

---

## 2026-08-04 — Identificador de pagamento lido do comprovante (OCR no navegador)

**O problema.** Quando o financeiro abria o extrato bancário, não dava pra saber de qual
venda era cada crédito: o nome que aparece no extrato é o do **titular que pagou**, que
muitas vezes não é o nome do cliente cadastrado (cônjuge, sócio, a empresa dele).

**O que foi feito.** Novo campo **`identificador_pagamento`** em `vendas_pendentes`, exibido
em linha própria na lista de Onboarding (em destaque quando falta) e editável no modal, com
histórico de edição como os demais campos.

O preenchimento é automático: o comprovante é lido por **OCR rodando no próprio navegador**
(`tesseract.js`, `src/lib/ocrComprovante.ts`). Não há chave de API, serviço externo nem custo
por leitura — a imagem nunca sai da máquina de quem está usando o sistema.

Três pontos de leitura:

1. **Formulário público** (`/vendas/nova`) — ao anexar o comprovante, o campo já vem preenchido para
   o closer conferir antes de enviar.
2. **Modal do onboarding** — botão "Ler comprovante" relê os arquivos já salvos quando o
   palpite saiu errado ou veio vazio.
3. **Backfill na lista** — botão que varre de uma vez todas as vendas antigas sem identificador.

**Como a leitura decide o nome.** O comprovante é dividido em blocos ("quem pagou" x "quem
recebeu") e só nomes do bloco do pagador são aceitos — senão a leitura devolveria a própria
Aliança, que é quem recebe. A heurística tem teste cobrindo os layouts de Nubank, Itaú, Banco
do Brasil, Inter e Mercado Pago (`src/lib/ocrComprovante.test.ts`).

**Limites conhecidos.** O tesseract só lê **imagem** — comprovante em PDF ou HEIC precisa ser
digitado à mão (o botão fica desabilitado nesses casos, com o motivo no tooltip). E o
resultado é sempre um palpite: o campo permanece editável em todos os pontos, por isso o texto
na tela pede conferência em vez de afirmar que está certo.

---

## 2026-07-31 (noite) — Formulário público de venda: erro genérico e comprovante recusado

**Sintoma.** A Roberta Marques não conseguia enviar uma venda em `/venda`: o formulário
mostrava apenas **"Edge Function returned a non-2xx status code"**. Os logs confirmaram
`POST | 400` em `vendas-publicas-create`.

**Três problemas encadeados, todos corrigidos:**

1. **O motivo real do erro era engolido.** A function responde 400 com um JSON explicativo
   (`{error, detail}`), mas o `supabase.functions.invoke` lança `FunctionsHttpError` e o front
   usava só `err.message` — a mensagem genérica do supabase-js. O corpo da resposta fica em
   `err.context`; agora ele é lido e traduzido para português (`mensagemDoErro`), então o closer
   vê "O comprovante X passa de 20 MB" em vez de jargão.

2. **Comprovante legítimo era recusado.** A validação exigia `image/*`, e (a) **PDF** — extrato
   de banco, o comprovante mais comum — era barrado mesmo com o bucket já configurado para
   aceitá-lo; (b) foto de iPhone (**HEIC**) e alguns prints chegam com `type` vazio ou
   `application/octet-stream`, caindo no mesmo 400. Agora o MIME é resolvido pela extensão
   quando o navegador não informa (`mimeDoArquivo`), e PDF é aceito de ponta a ponta.

3. **Nada validava o arquivo no anexo.** Tamanho e formato só eram checados no servidor, depois
   do formulário todo preenchido. Agora a recusa acontece no momento do anexo, nomeando o
   arquivo e o motivo.

**Limites elevados e alinhados** (eram inconsistentes entre bucket e function):

| | Antes | Agora |
|---|---|---|
| Tamanho por arquivo (function) | 5 MB | **20 MB** |
| Tamanho por arquivo (bucket) | 10 MB | **20 MB** |
| Arquivos por venda | 30 | **60** |
| Formatos | imagens (bucket recusava `heif`/`gif`) | JPG, PNG, WEBP, HEIC, HEIF, GIF, **PDF** |

**Observabilidade.** Toda recusa agora passa por `fail()`, que registra código e detalhe no log
da function — antes um 400 não deixava rastro e o diagnóstico dependia de reproduzir o que o
closer fez.

**Verificado em produção** (`vendas-publicas-create` v24): envio com PDF → 200; envio de HEIC
como `application/octet-stream` → 200 (ambos davam 400 antes); payload inválido → 400 com
`detail` legível. As duas vendas de teste foram removidas do banco.

---

## 2026-07-28 (noite) — Disparo: tag duplicada corrigida e escolha pessoa a pessoa

**Bug corrigido — o CRM ficava com N tags de mesmo nome.** Encontrado pelo Bruno ao abrir
o painel do GHL: uma única aplicação de tag em 3 contatos criou **3 tags idênticas**, todas
no mesmo minuto. Causa: `crm-aplicar-tag` escreve com 6 requisições em paralelo e o GHL cria
a tag no momento em que ela é usada — como a tag era inédita, as chamadas simultâneas não
enxergaram umas às outras e cada uma criou a sua.

Isso não é cosmético: o workflow do GHL amarra o gatilho a **uma** tag, então parte do
público receberia a tag "errada" e nunca seria disparada — falha silenciosa, do mesmo
tipo que o bug do espelho desatualizado.

Correção: a **primeira escrita do lote roda isolada** (parâmetro `aquecer` em `comLimite`),
criando a tag uma vez só; as demais seguem em paralelo e reaproveitam. Deployado no Empire
(`crm-aplicar-tag` v3, `verify_jwt=false`) e agora **versionado** em
`GHL-SUPABASE/supabase/functions/crm-aplicar-tag/` — antes só existia deployado.

**Escolha pessoa a pessoa na tela `/disparo`.** Antes o público saía em bloco: o que os
filtros de status/produto/tag devolvessem, ia inteiro. Agora há um passo 2 com busca por
nome ou telefone e uma caixa por pessoa. Todos entram marcados; desmarcar tira do envio.
Guardamos os **excluídos** (não os incluídos), então quem entra depois no recorte nasce
marcado em vez de sumir calado. O resumo mostra "N selecionados" e quantos foram
desmarcados, com atalho para restaurar.

**Contatos etiquetados nesta rodada** (para configurar o workflow no GHL):

| Tag | Quem |
|---|---|
| `teste-disparo-omnx-28jul` | 3 contatos fictícios criados pela ponte (`Teste Disparo OMNX 1/2/3`) — apagar depois |
| `demo-disparo-omnx-28jul` | 3 clientes reais **ativos** que já existiam no CRM: Alexandre de Almeida, Alison Machado, André Luis Rodrigues — receberam só a tag, cadastro intocado |

---

## 2026-07-28 — Disparo por tag no CRM: ponte concluída e testada

O Desk agora consegue pegar um recorte da base de contratos e entregá-lo etiquetado no
CRM. **O Desk não envia mensagem nenhuma** — quem dispara é o workflow do GHL que escuta
a tag. A tela `/disparo` (rota não listada no menu, só admin) já existia; faltava o outro
lado da ponte, que foi escrito e deployado agora.

**O que entrou**

- `crm-aplicar-tag` no projeto Empire (`qzesffnkqgelmtfblzkr`) — a única peça que escreve
  no GHL. Cópia de referência em `docs/integracoes/empire/crm-aplicar-tag.ts`.
- Deploy de `disparo-enviar-ghl` no Desk (estava só no repositório, sem estar no ar — era
  o erro de CORS que a tela dava).
- Funções `chave_telefone_br` e `crm_match_contatos_por_chave` no banco do Empire, com
  índice — o match em lote roda numa consulta só.
- Ponte por tenant **ativada**: secret no Vault dos dois lados (`tenant_integracoes` no
  Desk, `workspace_integration_credentials` no Empire). Antes rodava por secret global.

**A regra que evita estrago.** O match é pela chave canônica *DDD + últimos 8 dígitos*,
nunca pela string cheia: o mesmo celular está gravado com e sem o nono dígito entre as
bases, e comparar a string inteira criaria contatos duplicados. Quem tem **mais de um**
cadastro no CRM é marcado como ambíguo e **não é tocado** — escolher um seria chute.

**Bug pego no teste.** A primeira versão confiava no espelho local de contatos. Só que o
espelho guarda gente que já foi **apagada do GHL**: essas pessoas contavam como "já
existe", a tag falhava em silêncio e elas nunca receberiam a mensagem. A versão final
confere cada candidato na API do CRM antes de decidir. O espelho segue sendo usado para o
que só ele sabe: detectar cadastro duplicado.

**Testado contra o CRM de produção** (contato de teste criado e apagado ao final): tag em
contato existente, criação de contato novo, `dry_run` sem escrever nada, telefone com
máscara, tag com maiúscula/espaço, telefone ambíguo e telefone inválido.

**Falta:** o workflow no GHL com gatilho *Contact Tag Added*. Sem ele a tag é aplicada e
nada acontece. E a UI da tela `/disparo` precisa de uma passada de design.

---

## 2026-07-27 — Exportação de contratos com recorte próprio

O botão "Exportar" da lista de contratos baixava direto um CSV fixo com todas as
colunas. Agora abre um diálogo (`ExportContratosDialog`) onde se afina o recorte do
arquivo antes de gerar, com contador ao vivo de quantas linhas vão sair.

**Recortes:** todos os filtrados ou só os marcados na tabela; ignorar contratos sem
valor; só quem tem WhatsApp; só quem tem e-mail; um contato por cliente (dedupe por
telefone, com fallback no nome — evita mandar a mesma mensagem duas vezes para quem
tem mais de um contrato).

**Colunas:** presets "Disparo / contatos", "Financeiro" e "Completo", com ajuste
individual por coluna.

**Telefone.** Os números no banco vêm de origens diferentes e estão em formatos
variados ("21 98935-8444", "5511999998888", "(11) 99999-8888"). `src/lib/telefone.ts`
normaliza para E.164 (+55…), que é o formato aceito pelas ferramentas de disparo.
Quando o número não bate com nenhum tamanho conhecido, a linha sai marcada na coluna
"Aviso" em vez de ser descartada — melhor conferir do que perder o contato em
silêncio. Cobertura em `telefone.test.ts` (8 casos). Suíte 38/38.

**Contexto.** Nasceu da necessidade de disparar mensagens para clientes ativos de
produtos específicos via GHL. A exportação é genérica de propósito — nada de GHL
acoplado à tela, para não sujar o Desk multi-tenant.

---

## 2026-07-27 — Zeragem das pendências dos roadmaps (5 ondas)

Varredura das pendências acumuladas em `multi-tenant-roadmap.md`,
`ROADMAP-MODULARIZACAO.md`, `plano-datas-contratos.md` e `integracoes/vercel.md`.
O levantamento mostrou que parte já estava feita e nunca fora marcada.

**Onda 1 — segurança e higiene.** `vercel.json` ganhou os headers que faltavam (CSP
ficou de fora de propósito: quebraria a mídia do Chat; entra depois em Report-Only).
Buckets `avatars`, `contratos-anexos` e `vendas-comprovantes` ganharam limite de
tamanho e MIME. `contrato_modelos` ganhou CHECK de 7 MB no base64. `app_modules`
passou a `tenant_isolation` RESTRICTIVE. `types.ts` regenerado, `as any` removidos.

**Onda 2 — duas datas de contrato.** `data_assinatura` (gatilho do Clicksign) e
`data_pagamento` (derivada da entrada em `pagamentos`). Backfill de 300/300 e 23.
`data_fechamento` intocada de propósito — alterá-la dispararia recálculo de comissão
em massa. Faturamento conferido antes/depois: idêntico. Guarda da sentinela no
cálculo de comissão. O teste `fluxoFuturo` que falhava desde antes desta sessão
ancorava em `vencimento`, abandonado pelo código há tempos — o teste estava
desatualizado, não o código. Suíte 25/25.

**Onda 3 — permissões por app (Fase 2).** Tabela `permissoes_app`
(perfil × recurso × ação) + `has_permissao()` + hook `can()`. O seed reproduz o gate
anterior: 12/12 asserções iguais, ninguém ganhou nem perdeu acesso. Matriz editável
em `/admin`. 4 telas migradas; o resto segue no gate legado (aditivo por construção).

**Onda 4 — Fase C do multi-tenant.** A ponte com o Empire dependia de uma função com
`IF v_count <> 1 THEN RETURN` — quebraria para todos no dia da 2ª empresa. Agora
resolve por tenant, e as 5 edge functions usam o tenant do objeto sobre o qual agem.
Storage isolado por tenant sem mudar nenhum caminho de arquivo.

**Onda 5 — pendências menores.** Reporte de erros ganhou anexos (§14.2), tela
`/meus-reportes` com resposta ao usuário separada da nota interna (§14.5) e
`link_externo` (§14.6). `UserForm` passou a editar a liberação individual de
Contratos, completando o cadastro central de usuário.

**Fora de escopo por decisão:** Fase 4 (App Atendimento) adiada para PRD próprio;
Fases 7 e 8 são contínuas.

### Auditoria de segurança antes do merge (mesmo dia)

- **P0 — regressão introduzida pela própria Onda 4.** `REVOKE ... FROM anon, authenticated`
  não remove o grant implícito de `PUBLIC`. A função nova que devolve o secret da ponte
  Empire ficou executável por qualquer usuário logado. Provado explorando e provado
  corrigido. Não vazou: `tenant_integracoes` está vazia. A auditoria de 21/07 já havia
  **aprovado** que "a única função que decifra é service_role only" — ao clonar a função,
  o controle de acesso não veio junto.
- **P1 — pré-existente.** A policy de `users` consultava `users` dentro dela mesma →
  recursão infinita em todo UPDATE, inclusive de admin: a **edição de colaboradores estava
  quebrada em produção**. A mesma policy permitia editar a própria linha sem restringir
  colunas, então consertar só a recursão abriria auto-promoção a admin. Corrigidos juntos,
  com 4 testes sob o motor de RLS real.

### Correção da busca de contratos (reportada pelo usuário)

A busca por nome não funcionava, por duas causas somadas:

1. **Sem normalização de acento** — "jose" não achava "José". Não havia `normalize()` em
   lugar nenhum do projeto.
2. **Filtro de status padrão** — a lista abre em `ATIVO` + `Não iniciado`, deixando ~105
   dos 326 contratos invisíveis. Em vez de mudar o padrão silenciosamente, a lista passou
   a avisar quantos contratos casam com a busca mas estão fora do filtro, com botão para
   mostrar todos.

## 2026-07-27 — Aba Produtos em Contratos (catálogo + modelos juntos)

- **Nova tela `/contratos/produtos`** (só admin), entre Recebíveis e Tags. Até
  aqui o catálogo de produtos (`products` com `client_id IS NULL`) só existia no
  banco: alimentava os seletores de contrato/venda/modelo, mas **não havia nenhuma
  tela para cadastrar, renomear ou desativar** — os 15 produtos foram inseridos
  por SQL.
- Cada produto é uma **linha expansível**: ao abrir, mostra nome/descrição
  editáveis (salvam no blur), os **modelos .docx daquele produto** (baixar,
  substituir, excluir, adicionar por variante) e o botão de ativar/desativar.
  Bloco fixo no fim para o **modelo padrão** (`produto_id NULL`).
- **Sem exclusão de produto por design** — contratos existentes apontam para ele;
  desativar tira dos seletores e preserva o histórico. O contador de contratos por
  produto soma `produto_id` **e** `produto_nome` (contratos legados do Notion não
  têm o id).
- **Aba "Modelos" absorvida:** `ContratoModelosPage` removida e
  `/contratos/modelos` passa a redirecionar para `/contratos/produtos`.
- Arquivos: `src/hooks/useProdutosCatalogo.ts` (novo),
  `src/pages/contratos/ProdutosCatalogoPage.tsx` (novo), `ContratosTabs`, `App.tsx`.
  Sem migration — `products` já tinha `tenant_id` (trigger `set_tenant_id`) e RLS
  `tenant_isolation`.

## 2026-07-24 — Fase 6 (conclusão): Interações/NPS/Entregas/Trilhas internos

- **Interações** removida por completo: tela `/interacoes`, hook exclusivo
  `useInteractions` e tabela `client_interactions` (0 linhas, 0 FK externa).
- **NPS/Entregas/Trilhas internos:** removidas só as **telas internas** de gestão
  (fora do menu) — `NpsPage`, `EntregasPage`, `EntregaDetailPage`, `EntregaForm`,
  `TrilhasPage`, `TrilhaDetailPage`. **Tabelas e hooks compartilhados preservados**
  (`useNps`, `useEntregas`, `useCamiDeliveries`, `useTrilhas`, `nps_*`, `deliveries`,
  `learning_*`) porque o **Portal do cliente e os Relatórios os consomem**.
- Precedida de auditoria de dependências (subagente) que evitou quebrar o Dashboard:
  `EntregasCamiPage` parecia morta mas é usada na aba Entregas do Dashboard — mantida.

## 2026-07-24 — Fase 6 (parcial): remoção de legado morto

- **7 páginas órfãs de Comissão** removidas (`AprovacoesPage`,
  `ComissoesDashboardPage`, `ConsultoresPage`, `ExtratosPage`, `ExtratoDetailPage`,
  `ExtratoPrintPage`, `ProdutosComissaoPage`) — sem rota nem import; versão viva é o
  projeto OMNX-Comissões separado. Pasta `src/pages/comissoes/` deixou de existir.
- **Pipelines / Oportunidades removido por completo** (decisão do usuário):
  tela `/pipelines` + painel `ClienteOportunidades` no detalhe do cliente + hook
  `useSalesPipelines`, e **drop das 6 tabelas `sales_*`** (168 oportunidades).
  Auditoria antes: 0 FKs externas, 0 funções dependentes; dump dos dados salvo fora
  do banco antes do drop. Migration `20260724140000_drop_pipelines_sales.sql`.
- Auditoria E6.1 registrada: Interações/NPS/Entregas/Trilhas internos estão ~vazios
  (candidatos), mas não removidos ainda (rota viva; Portal usa parte disso).

## 2026-07-24 — Fase 3: desenredar Contratos × Comissões (higiene)

- `ContratosPage`, `ContratoDetailPage`, `ContratosKanbanPage` + `recorrencia.ts`
  saíram de `src/pages/comissoes/` para `src/pages/contratos/` (via `git mv`,
  comportamento idêntico). `ComissoesLayout` (órfão) removido.
- Fronteira confirmada: as páginas de comissão puras deste repo estão órfãs — a
  versão viva é o projeto **OMNX-Comissões** separado. Removê-las fica pra Fase 6.

## 2026-07-24 — Documentação (changelog, arquitetura, UML, acesso, integrações)

- Criados: `MUDANCAS.md` (este changelog), `ARQUITETURA.md` (doc canônico, já
  refletindo o modelo multi-tenant vigente), `UML.md` (ER + fluxo dos apps por
  engenharia reversa do schema), `reestruturacao/NIVEIS-DE-ACESSO.md` (as 4 camadas
  de acesso atuais — pré-requisito da Fase 2), `integracoes/README.md` (índice) e
  `integracoes/vercel.md` (deploy + gap dos headers de segurança).
- **Fase 0 da reestruturação concluída** (faltavam UML e níveis de acesso).

## 2026-07-24 — Provisionamento de empresas + fecho do multi-tenant

- **Fase A.2 (NOT NULL)** aplicada em produção: `tenant_id` agora é `NOT NULL` em
  **106 tabelas** (0 nullable). Defesa extra contra insert via `service_role` sem
  tenant. Lock curto (maior tabela `chat_messages` ~43k linhas).
- **Fase 1 (modularização) — Cobrança e Portal** entram no catálogo `app_modules`
  (5 apps: dashboard/chat/contratos/**cobranca/portal**), todos ligados (fail-open).
  Rotas `/cobranca` e `/portal` passam a respeitar o liga/desliga (`RequireApp`).
- **E1.7:** o toggle de apps (`useToggleAppModule`) grava `updated_by` — auditoria
  de quem ligou/desligou.
- **Provisionamento** (WIP → produção): tela `/empresas` (só admin do tenant MESTRE
  via `is_master_admin()`) cria empresa nova = tenant + 1º admin (fluxo legado de credencial inicial)
  + `seed_tenant` (kanban + departamentos). Edge function `provision-tenant`.
- **Fix crítico (achado em teste E2E):** `handle_new_user` passou a carimbar
  `user_roles.tenant_id` explicitamente. Antes omitia, e com >1 tenant + Fase A.2 a
  criação de qualquer usuário quebraria assim que a 2ª empresa fosse criada.
- **Teste end-to-end validado** (transação com rollback, motor RLS real): empresa
  nova nasce com 5 apps + 6 colunas de kanban + 2 departamentos; o admin novo é
  carimbado no tenant certo, não herda cargo de outro tenant, e **vê 0 dados de
  negócio** (contratos/clients/comissões/vendas) — só os próprios 5 apps.
- UX: URL base do Empire (Integrações) escondida num `<details>` avançado.

## 2026-07-23 — Multi-tenant: isolamento de dados por tenant (Fases A + B)

- **Fase A:** `tenant_id` + trigger de carimbo (`tg_set_tenant_id` /
  `resolve_tenant_default`) + backfill + índice em **98 tabelas de negócio**.
- **Fase B:** policy **RESTRICTIVE** `tenant_isolation` por tabela
  (`tenant_id = get_user_tenant_id()`), combinando em AND com as regras de perfil.
- **Hardening:** RLS deny-all + revoke em 6 tabelas de backup/dedup; revoke de
  `EXECUTE` de PUBLIC nas funções de trigger. Teste cross-tenant: empresa fictícia
  lê 0 em 100/100 tabelas; injeção cross-tenant bloqueada (42501).
- **Modularização (Fase 1 inicial):** tabela `app_modules` por tenant, hook
  `useAppModules`, menu dinâmico, guard `RequireApp`, tela `/apps` (admin).
- **Reporte de erros (Fase 5):** botão flutuante + painel de triagem `/reportes`
  (multi-tenant, protocolo `ERR-0000X`).

## 2026-07-21 — Ponte GHL: contrato assinado move card

- Trigger `link_clicksign` → `empire-contrato-assinado-ghl` → `crm-marcar-assinada`
  move o card para Vendas SQL/Assinada no CRM Empire.

## 2026-07-07 — Gerador de contrato em PDF + Kanban configurável

- Botão "Gerar contrato" no onboarding: modelos `.docx` por produto + preview
  editável + PDF via CloudConvert.
- Kanban de contratos com colunas editáveis por admin + coluna Onboarding.

## 2026-07-02 — Módulo Contratos no menu principal

- Contratos vira módulo próprio (`/contratos`) com abas Dashboard/Lista/Kanban/
  Onboarding. Comissões por "valor total". Status vira ATIVO ao anexar Clicksign.

## 2026-05-07 — Módulo Comissões

- Entrega inicial de `/comissoes`: schema, cálculo (regra do dia 15), fechamento
  mensal, import do Notion. Doc em `docs/comissoes.md`.

---

> Entregas mais antigas (Fases 1–27 do core/chat/cobrança/IA) estão consolidadas
> em `docs/PROGRESS.md`.
# 2026-09-12 — Membro SaaS depois do owner

`provision-tenant` aceita a ação M2M `provision_member` somente com a chave de
plataforma. Ela localiza o tenant previamente criado pelo owner via `external_ref`,
reutiliza/cria a identidade OIDC e fixa o papel operacional `atendimento`. Se o tenant
não existe, falha com `owner_not_activated`; conta presa a outro tenant falha fechado.
A migration `20260912211000_saas_member_identity_lookup.sql` adiciona um lookup de
`auth.users` exclusivo de `service_role`.
