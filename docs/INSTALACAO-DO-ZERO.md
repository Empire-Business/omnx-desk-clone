# Instalação do zero (Supabase, Vercel e GitHub do cliente)

> Atualizado em: 19/11/2026 às 18h20 BRT

Como o Desk sobe num projeto Supabase **vazio**, só com o que está neste repositório, sem
depender de nada que exista apenas na produção da empresa. É o caminho do instalador do
app HTAI (aplica `supabase/migrations/*.sql` em ordem pela API do Supabase, envia as funções
com `supabase functions deploy --use-api` e publica o site pela Vercel CLI).

## 1. Banco: a cadeia de migrações monta do zero

Até 09/11/2026 a pasta `supabase/migrations` sozinha parava no arquivo 18 de 190: parte do
banco da produção foi criada à mão (editor do Lovable / SQL Editor), sem migração. Em vez de
reescrever migrações que já rodaram na produção, entraram **migrações-ponte** com datas que
as colocam exatamente onde faltava o objeto. Nenhuma migração antiga foi alterada.

| Arquivo | O que cria | Na produção |
|---|---|---|
| `20260408000000_linha_de_base_tabelas_fora_das_migracoes` | 5 tabelas de chat feitas à mão (formato de 19/05/2026) | tudo "já existe" |
| `20260505192000_linha_de_base_funcoes_fora_das_migracoes` | 16 funções que a 20260505192242 endurece; só cria se faltar | não troca nada |
| `20260519165000_linha_de_base_producao_2026_05_19` | o `SETUP_COMPLETE.sql` (retrato da produção em 19/05) transformado para rodar por cima | **recusa** (trava) |
| `20260722235000_linha_de_base_objetos_pos_19_05` | módulo PJ, papéis de comissão, número de contrato, `notify_secret_matches`, 4 colunas | só cria o que faltar |
| `20260723165000_linha_de_base_reportes_erro_antes_do_hardening` | `reportes_erro` antes da migração que endurece (duas usam a versão 20260723170000) | idempotente |
| `20261109100000_instalacao_do_zero` | ajustes do caminho do zero (seção 3) | sem mudança de comportamento |

A linha de base de 19/05 tem uma trava: se o banco já tem `clients.tenant_id` (produção), ela
para com uma mensagem. Para alinhar o histórico da produção sem rodar nada:

```bash
supabase migration repair --status applied 20260408000000 20260505192000 20260519165000 20260722235000 20260723165000
```

(Continua valendo: **nunca `supabase db push`** na produção; ver `docs/reestruturacao/REORGANIZACAO-DESK-V2.md`.)

### Como ensaiar sem Docker

```bash
# Postgres 17 local (ex.: brew install postgresql@17), superusuário local
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres node supabase/tests/banco-do-zero/ensaiar.mjs --continuar
```

O script cria um banco vazio, aplica `stub-supabase.sql` (imitação mínima de um projeto
Supabase novo: papéis, auth, storage, vault, pg_cron, pg_net) e as migrações em ordem, cada
uma numa transação, como o instalador. Resultado esperado: `N arquivos; 0 falharam`.
Com Docker e o Supabase CLI, o ensaio fiel é `supabase db reset` num projeto local.

Limite honesto: o stub roda como superusuário; no Supabase de verdade as migrações rodam
como `postgres` (sem superusuário). O ensaio numa conta Supabase de teste continua pendente.

Com `--verificar`, o script roda cada `verificar-*.sql` da pasta (licença, aviso da licença,
primeiro acesso e superadmin), numa transação desfeita no fim. A corrida de dois cadastros
ao mesmo tempo precisa de duas conexões e roda à parte, depois do ensaio:

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres node supabase/tests/banco-do-zero/corrida-primeiro-acesso.mjs
```

## 2. Segredos e cofre

| Nome | Onde | Quem cria |
|---|---|---|
| `wa_auto_cron_secret` | cofre do banco | migração 20261026160000 (aleatório) |
| `notify_webhook_secret` | cofre do banco | migração 20261109100000 (aleatório, se faltar) |
| `project_url` | cofre do banco | instalador (`https://<ref>.supabase.co`); usado por `app_url_funcoes()` |
| `anon_key` | cofre do banco | instalador (chave pública); usada por `app_chave_anon()` |
| `cron_secret` | cofre do banco | instalador, **mesmo valor** de `CRON_SECRET` das funções (Instagram) |
| `htai_escopo` | cofre do banco | instalador (`instalacao`, fixo): liga o escopo instalação da licença |
| `htai_instalacao_id` | cofre do banco | instalador, depois da ativação |
| `htai_entitlements_mode` | cofre do banco | instalador (licença; ver `docs/LICENCA-HTAI.md`) |
| `UAZAPI_URL` | segredo das funções | instalador (endereço da UAZAPI da pessoa) |
| `REUNIAO_VIDEO` | segredo das funções | instalador (`off`): `wa-auto-agendar` não manda link da sala de vídeo |
| token de cada número | cofre (tela Conversas > Instâncias) | a pessoa, pelo app |

Sem `project_url`/`anon_key` no cofre, as funções de banco usam o endereço atual da produção
como reserva (é o comportamento de hoje da empresa).

## 3. O que muda só num banco novo

`20261109100000_instalacao_do_zero.sql` decide pelo banco estar vazio (`auth.users` sem
ninguém) ou pela integração estar configurada, para não mexer na produção:

- **Primeiro acesso:** a primeira conta vira administradora da empresa principal (a "mestre"
  da semente), com o nome que ela informar (`empresa` nos metadados) ou o nome dela.
  Depois dela, conta nova só entra com papel e empresa vindos do servidor (`app_metadata`,
  gravado por `admin-create-user` e `provision-tenant`); sem isso o banco recusa o cadastro
  (migração `20261119150000`, gatilho adiado `desk_conta_nova_conferida`).
  Desde 19/11/2026 (`20261119180000`): a tela de entrada mostra **"Criar a primeira conta"**
  (nome, empresa, e-mail e senha) só enquanto `desk_primeiro_acesso_aberto()` responde `true`,
  isto é, enquanto não há nenhuma administradora (nem papel `admin` em `user_roles`, nem perfil
  `admin` em `users`). O `handle_new_user` usa a mesma função e uma trava consultiva: dois
  cadastros ao mesmo tempo geram uma administradora só. Na produção sempre há administradora:
  o botão não aparece e nada muda. O instalador continua fechando o cadastro público no passo
  `primeiro-acesso`.
- **Integração interna com o CRM da empresa (GHL):** gatilhos e monitor diário só disparam
  com `integracoes_internas.crm_empresa = true` (produção) ou com a ponte cadastrada em
  Configurações > Integrações. Num banco novo nasce desligada.
- **Agendamentos:** `contratos-alerts` passa a mandar `x-cron-secret`; criados só se não
  existirem: régua de cobrança (5 min), monitor de SLA (5 min), Instagram (fechamento semanal).
  O alerta diário do Instagram não é agendado (a função usa uma tabela que não existe).
  Jobs existentes de `cobranca-scheduler`/`chat-broadcast-scheduler` recebem o segredo.
- **Dados de exemplo da empresa** (grupo de aquecimento, catálogo de produtos) saem.

## 4. Variáveis do site (Vercel)

| Variável | Padrão | Para quê |
|---|---|---|
| `VITE_APP_NAME` | `OMNX Desk` | nome do app em todas as telas, título, manifesto e notificações (`src/config/brand.ts`) |
| `VITE_APP_EMPRESA` | empresa, na marca OMNX; vazio fora dela | rodapé das páginas públicas |
| `VITE_HTAI_CENTRAL_URL` | vazio (desligado) | central do HTAI (lista de plataformas). **Vazio = o token de sessão não sai do app** |
| `VITE_HTAI_LOGIN_PROVIDER` | vazio (botão escondido) | botão "Entrar com High Ticket AI" (ex.: `custom:empire-os`) |
| `VITE_REUNIAO_VIDEO` | ligado | sala de vídeo e transcrição (funções fora deste repositório) |
| `VITE_REUNIAO_RESUMO_IA` | ligado | resumo de reunião por IA (função fora deste repositório) |
| `VITE_TUTORIAIS_VIDEO` | ligado só na marca OMNX | vídeos do manual (tocam só no domínio da empresa) |
| `VITE_GT3_URL` | link da empresa só na marca OMNX | link "Entrar no GT3" do manual |
| `VITE_CAMI_ENTREGAS` | ligado | entregas da Cami (integração interna; função `cami-deliveries`) |

Tudo em `src/config/recursos.ts`.

**Deploy da empresa (desk.omnx.pro):** para manter a lista de plataformas e o login pelo HTAI,
preencha na Vercel `VITE_HTAI_CENTRAL_URL=https://dtmusrvtsnpamgqcmuwa.supabase.co/functions/v1`
e `VITE_HTAI_LOGIN_PROVIDER=custom:empire-os` **antes** de publicar esta versão.

**Instalação do zero:** a receita deixa as duas vazias e põe `VITE_REUNIAO_VIDEO=off`,
`VITE_REUNIAO_RESUMO_IA=off`, `VITE_CAMI_ENTREGAS=off` e `VITE_APP_NAME` com o nome escolhido.

## 5. O que fica fora do pacote instalável (decisões do dono, 09/11/2026)

| O quê | Por quê | Como sai |
|---|---|---|
| `chat-broadcast-scheduler` (campanhas de chat) | usa `chat_campaigns` e `chat_campaign_contatos`, que não existem em migração nenhuma (nem na produção) | receita: `ignorar` a pasta da função |
| `instagram-alerts` | usa `latest_instagram_snapshots`, que não existe | receita: `ignorar` a pasta; a 20261109100000 não agenda o job |
| `cami-deliveries` (entregas da Cami) | usa `content_cards` e `get_auth_user_emails`, que não existem; é integração interna | receita: `ignorar` a pasta e `VITE_CAMI_ENTREGAS=off` |
| respostas rápidas no `ia-suggest-reply` | `chat_respostas_rapidas` não existe; a consulta saiu do código | código |
| videochamada e resumo de reunião | as funções `livekit-*`, `soniox-token` e `meeting-ai-summary` não estão no repositório e a `soniox-token` da produção entrega a chave ao navegador | receita: `VITE_REUNIAO_VIDEO=off`, `VITE_REUNIAO_RESUMO_IA=off`, `REUNIAO_VIDEO=off` |
| modelos de contrato `.docx` prontos | modelo genérico precisa de revisão jurídica; o cliente sobe os dele | receita: `ignorar` `public/modelos-contrato/` (já está); a tela pede o arquivo |
| testes (`*.test.*`, `supabase/tests/`, `_tests/`) | trazem nomes reais | receita: `ignorar` (já está) |

## 6. Receita do HTAI: entradas que esta versão exige

Para a receita `internas/apps/desk/app.json` (repositório skills-ia), além do que já existe:

```json
"variaveis": [
  { "nome": "HTAI_ESCOPO", "origem": "fixo:instalacao", "destino": ["funcoes", "vault:htai_escopo"] },
  { "nome": "HTAI_INSTALACAO_ID", "origem": "htai.instalacao", "destino": ["funcoes", "vault:htai_instalacao_id"] },
  { "nome": "HTAI_ENTITLEMENTS_MODE", "origem": "htai.modo", "destino": ["funcoes", "vault:htai_entitlements_mode"] },
  { "nome": "HTAI_APP_VERSION", "origem": "app.versao", "destino": ["funcoes"] },
  { "nome": "CRON_SECRET", "origem": "gerar.aleatorio", "destino": ["funcoes", "vault:cron_secret"] },
  { "nome": "REUNIAO_VIDEO", "origem": "fixo:off", "destino": ["funcoes"] },
  { "nome": "VITE_REUNIAO_VIDEO", "origem": "fixo:off", "destino": ["vercel"] },
  { "nome": "VITE_REUNIAO_RESUMO_IA", "origem": "fixo:off", "destino": ["vercel"] },
  { "nome": "VITE_CAMI_ENTREGAS", "origem": "fixo:off", "destino": ["vercel"] }
],
"ignorar": [
  "supabase/functions/chat-broadcast-scheduler/",
  "supabase/functions/instagram-alerts/",
  "supabase/functions/cami-deliveries/"
],
"variaveis_ignoradas": {
  "VITE_HTAI_CENTRAL_URL": "central da empresa; vazio no cliente (o token de sessão não sai do app)",
  "VITE_HTAI_LOGIN_PROVIDER": "login pela central da empresa; escondido no cliente"
}
```

`HTAI_ESCOPO` no cofre é o que faz o banco travar desde a instalação (antes da ativação a
licença fica "não ativada"). A ordem do instalador (`banco` → `licenca` → `funcoes` → `vercel`
→ `primeiro-acesso`) já é a certa: o cofre é gravado no passo `funcoes`, depois da ativação;
o agendador instala as travas e faz o primeiro pull em até 5 minutos. Faça o
`primeiro-acesso` depois que Configurações mostrar a licença ativa.

## 7. Segurança do app instalado

- **Superadmin com segundo fator:** quem administra a empresa principal só cria e enxerga as
  outras empresas com a verificação em duas etapas confirmada (TOTP). Ver `docs/LICENCA-HTAI.md`.
- **`send-push`:** só aceita a chave de serviço do próprio projeto (antes aceitava qualquer
  chamada) e cifra o corpo (RFC 8291).
