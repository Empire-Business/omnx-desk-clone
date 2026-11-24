# Licença HTAI por instalação

> Atualizado em: 19/11/2026 às 20h10 BRT

Lado do app do contrato `htai.entitlement.v1`, escopo **instalação**: o direito vale
para a instalação inteira (todas as empresas dela). Mesma assinatura
(`HTAI-HMAC-SHA256-V1`), cabeçalhos, janela de 300 s e estados do módulo do GT3.
Slug do app no contrato: **`omnx-desk`** (`X-HTAI-App` e campo `app`; a central
também aceita `desk`).

## Produção da empresa × app instalado

| | Produção da empresa (desk.omnx.pro) | App instalado no cliente |
|---|---|---|
| Como o app sabe | nenhum segredo `htai_*` | `HTAI_ESCOPO=instalacao` ou `HTAI_INSTALACAO_ID` (funções) e `htai_escopo` / `htai_instalacao_id` (cofre) |
| Modo sem `HTAI_ENTITLEMENTS_MODE` | `off`: nenhuma chamada à central, nenhuma trava, nenhuma tela nova | **`enforce`** |
| `HTAI_ENTITLEMENTS_MODE=off` | `off` | continua `enforce` (o app instalado não desliga a licença por variável) |
| `HTAI_ENTITLEMENTS_MODE=shadow` | `shadow` | `shadow` (só no piloto, por 1 semana; decisão do dono 16) |
| Segundo fator do superadmin | não exigido | exigido (ver "Segundo fator") |

**A produção não muda sem configuração nova.** O teste `verificar-licenca.sql`
(caso 1) e os testes do módulo conferem isso.

## Variáveis

| Onde | Nome | Origem na receita | O que é |
|---|---|---|---|
| funções + cofre `htai_escopo` | `HTAI_ESCOPO` | `fixo:instalacao` | liga o escopo instalação desde a instalação (falha fechada antes da ativação) |
| funções + cofre `htai_entitlements_mode` | `HTAI_ENTITLEMENTS_MODE` | `htai.modo` | `enforce` ou `shadow` |
| funções + cofre `htai_instalacao_id` | `HTAI_INSTALACAO_ID` | `htai.instalacao` | id da instalação, emitido na ativação |
| funções | `HTAI_PLATFORM_KEY` | `htai.platform_key` | chave desta instalação (`X-Platform-Key`) |
| funções | `HTAI_SIGNING_SECRET` | `htai.signing_secret` | segredo HMAC (≥ 32 caracteres) |
| funções | `HTAI_PULL_URL` | `htai.pull_url` | endereço do pull na central (https) |
| funções | `HTAI_APP_VERSION` | `app.versao` | opcional; vai no corpo do pull (`HTAI_APP_VERSAO`, nome antigo, ainda vale) |

Nada disso vai para o navegador. O banco lê só o cofre; as funções, só os segredos delas.

## Como funciona

- **Pull** (`supabase/functions/htai-licenca`): o agendador `htai-licenca-5min`
  (pg_cron) chama a função com `x-cron-secret`; ela faz o pull assinado só quando
  `renew_after` venceu, confere a assinatura da resposta (`htai-response`), recusa
  replay e envelope de outra instalação, e guarda o último envelope válido em
  `public.htai_licenca_estado`. Em `off` o comando do agendador não faz nada.
- **Respostas da central:**

  | Resposta | O app |
  |---|---|
  | `200` assinado | aplica (instalação revogada também vem assim: `status: "revoked"`) |
  | `401` / `403` sem assinatura (`invalid_platform_key`, `invalid_signature`, `app_mismatch`...) | **rejeitado**: não aplica nada, mantém o último envelope válido e não estende a validade; registra `rejeitado:<código>` |
  | `5xx`, rede, resposta sem assinatura válida | central fora do ar: vale a folga offline |
  | `404` | não existe neste contrato; se aparecer (proxy, endereço errado), conta como central fora do ar |

- **Prazos** (vêm no envelope, definidos pela central): carência de 7 dias depois do
  vencimento (`grace`), folga offline de 3 dias (`offline_grace_seconds` = 259.200; o
  app recusa envelope com mais de 604.800), envelope válido por 1 hora.
- **Decisão** (a mesma em `_shared/htai-licenca-core.ts` e em `public.htai_licenca_situacao()`):

  | Situação | O app |
  |---|---|
  | `active` / `grace` dentro de `valid_until` | funciona |
  | central fora do ar | funciona até `valid_until + offline_grace_seconds` |
  | `suspended`, `revoked`, `expired`, passou da folga | nega |
  | sem credencial ou sem envelope válido (em `enforce`) | nega como "não ativado" (falha fechada) |
  | `shadow` | avalia e só registra o que negaria (log das funções e do Postgres) |

## Com a licença negada

Ficam abertos só **login, Configurações da conta, Ajuda e exportar** (contrato §4,
decisão do dono de 09/11/2026). "Configurações" = configurações da **conta**: perfil,
senha, verificação em duas etapas, aparência, notificações, marca e dados da empresa,
e a tela de licença. **Credenciais de integração (chaves de API, tokens de WhatsApp,
integrações) ficam travadas como os dados.** Nenhum dado é apagado.

| Camada | Como nega | Onde está |
|---|---|---|
| Escrita no banco | gatilho por comando `htai_licenca_trava` em toda tabela com `tenant_id` fora de `htai_licenca_tabelas_livres()`; vale também para a `service_role` | migração 20261109130000 |
| Leitura no banco (navegador e Realtime) | política RESTRITIVA `htai_licenca_leitura` em toda tabela com `tenant_id` fora de `htai_licenca_tabelas_leitura_livre()` | idem |
| API do banco (tabelas, visões e RPCs) | função de pré-requisição `htai_licenca_pre_request` (PostgREST `db-pre-request`, ligada em `authenticator`): só passam as tabelas livres e as RPCs de `htai_licenca_rpcs_livres()`; o resto recebe **402** com a mensagem | idem |
| Arquivos (Storage) | política RESTRITIVA `htai_licenca_arquivos` em `storage.objects`, menos os buckets `branding`, `avatars` e `reportes-anexos` | idem |
| Funções | `servirComLicenca()` na entrada de **todas** as funções; respondem 402 antes de qualquer trabalho. Abertas: `htai-licenca`, `htai-exportar`, `desk-change-password`, `iris-ajuda` (só o manual público). As duas portas de API, `chat-api-v2` e `desk-mcp`, entram pelo mesmo caminho dentro do handler (`travaDeLicenca()`, antes de ler a chave) e respondem 402 com o mesmo corpo por motivo. O teste `htai-licenca-cobertura.test.ts` lista todas | `_shared/htai-licenca.ts` |
| Tela | `TravaDeLicenca` troca as telas de uso por "Licença inativa"; rotas abertas em `ROTAS_ABERTAS_SEM_LICENCA` (`src/lib/licenca.ts`); a seção Integrações some de Configurações | `src/components/licenca/AvisoLicenca.tsx` |

As travas são instaladas por `htai_licenca_aplicar_travas()`, que o agendador roda a
cada 5 minutos fora do modo `off` (também cobre tabelas novas). Em `shadow` as
políticas existem mas liberam. `htai_licenca_remover_travas()` desfaz tudo (só por
decisão do dono).

**Tabelas livres para escrita:** `tenants`, `users`, `profiles`,
`desk_password_requirements`, `push_subscriptions`, `chat_message_reads`,
`internal_message_reads`, `reportes_erro`, `app_logs`, `audit_logs`,
`contratos_audit_log`, `webhook_logs`. **Para leitura:** `tenants`, `users`,
`user_roles`, `profiles`, `desk_password_requirements`, `push_subscriptions`,
`app_modules`, `permissoes_app` (o menu precisa saber o que a pessoa pode) e `reportes_erro`.

Mensagem, uma por motivo (desde 19/11/2026, `20261119180200`; mesmos textos em
`_shared/htai-licenca-core.ts` e `src/lib/licenca.ts`), sempre terminando em "Seus dados estão
guardados e você pode exportá-los.":

| Motivo | Texto |
|---|---|
| `nao_ativado` | "Ative a licença deste app." |
| `expired` (vencida na central) | "A licença deste app venceu. Renove na sua conta HTAI para voltar a usar." |
| `suspended` | "A licença deste app está suspensa: o uso foi pausado pela HTAI. Fale com o suporte da HTAI para voltar a usar." |
| `revoked` | "A licença deste app foi desativada pela HTAI. Fale com o suporte da HTAI para saber o motivo." |
| `vencida` (passou da folga sem confirmar na central) | "Não foi possível confirmar a licença deste app: ele ficou mais tempo que o permitido sem falar com a HTAI. Ele volta a funcionar sozinho quando a conexão voltar; se continuar assim, fale com o suporte da HTAI." |

A tela escolhe o texto pelo motivo (fica certo mesmo num banco ainda sem a migração).

## Exportar os dados (sempre aberta)

Configurações > **Exportar dados** (`/configuracoes?secao=dados`), só para a
administração da empresa. Chama a função `htai-exportar`, que confere o JWT, a empresa
(`get_user_tenant_id`) e `is_admin()`, e lê pela `service_role` toda tabela com
`tenant_id` da empresa (lista em `htai_exportar_tabelas()`), de mil em mil linhas, num
arquivo JSON (`htai-exportacao-v1`). Não saem: colunas com nome de segredo (token,
senha, chave...), tabelas de token e `api_keys`. Os anexos continuam no Storage do
projeto da pessoa (o JSON traz os caminhos); ela é dona da conta Supabase.

## Aviso de versão nova (18/11/2026)

Mesmo padrão do GT3 (`20261116130000` lá). A central manda, na resposta 200 assinada do pull,
`atualizacao: {versao_mais_nova, novidades}` quando há versão no catálogo. A função
`htai-licenca` (agendador e "atualizar" da tela) grava em `public.htai_app_update` (uma linha):
`htai_installation_set_installed_version` a cada rodada, com `HTAI_APP_VERSION` (o aviso some em
até 5 minutos depois de atualizar), e `htai_installation_set_update` depois de cada envelope
aplicado. As duas RPCs são só `service_role`; logado só lê; anônimo não vê. Configurações mostra a
faixa "Versão nova do <app>" para a administração da empresa principal (superadmin), quando as duas
versões são `x.y.z` e a mais nova é maior, com o botão que copia "Atualize o meu app <app>.".
Falha em qualquer parte disso nunca muda a licença. Na produção da empresa (modo off) nada é
gravado e não há faixa. Com a licença negada, a pré-requisição da API recusa a tabela e a faixa
não aparece. Migração `20261118120000_htai_app_update.sql`; código em `_shared/htai-app-update.ts`,
`src/lib/app-update.ts` e `src/components/configuracoes/AvisoVersaoNova.tsx`.

## Segundo fator do superadmin

Decisão do dono F-02. No escopo instalação, `is_master_admin()` (quem administra a
empresa principal e cria/enxerga as outras empresas; desde 19/11/2026, pela mesma régua de
`is_admin()`: só `users.perfil = 'admin'`, migração 20261119180100) só vale com a sessão em `aal2`
(verificação em duas etapas por aplicativo autenticador, TOTP do Supabase Auth). A tela
Empresas e Configurações > Verificação em duas etapas cadastram o fator e confirmam a
sessão. Na produção da empresa nada muda. Migração 20261109140000. Pré-requisito: TOTP
ligado em Supabase > Authentication > Multi-Factor (vem ligado nos projetos novos).

## Chave de cifra por finalidade (F-04)

O Desk não tem chave de cifra própria: segredos de número de WhatsApp, cron e webhooks
ficam no Vault do Supabase (chave gerida pelo Supabase, por projeto) e a licença usa
só o `HTAI_SIGNING_SECRET` (HMAC, uma finalidade). Não há chave usada para duas
finalidades; nada a migrar antes do primeiro cliente. Se um dia o Desk passar a cifrar
algo com chave própria, uma chave por finalidade (variável própria na receita, origem
`gerar.chave32`).

## Como testar

```bash
npx vitest run supabase/functions/_shared/htai-licenca-core.test.ts \
  supabase/functions/htai-licenca supabase/functions/htai-exportar \
  supabase/functions/_shared/htai-licenca-cobertura.test.ts \
  src/lib/licenca.test.tsx src/lib/mfa.test.tsx
deno test --no-lock --allow-env --allow-read supabase/functions/_shared/htai-licenca-core_test.ts

# Banco (Postgres 17 local, sem Docker): migrações + verificar-licenca.sql
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres node supabase/tests/banco-do-zero/ensaiar.mjs --continuar --verificar
# esperado: "N arquivos; 0 falharam" e "ok verificar-licenca.sql"
```

`verificar-licenca.sql` cobre: produção sem segredo (nada muda, superadmin sem segundo
fator); escopo instalação sem modo (= enforce, inclusive com `off`); não ativado nega
leitura, escrita, API, visão e RPC de dados, e deixa conta, Ajuda, login e a
`service_role` passarem; credenciais de integração travadas; licença ativa libera;
vencida além da folga nega e dentro da folga libera; `shadow` só registra; superadmin
exige `aal2`; `remover_travas` desfaz tudo.

## Limite honesto

O código fica com o cliente; alguém técnico pode arrancar a verificação. O que
segura: credenciais por instalação revogáveis, atualizações e suporte só com
licença, a regra do `AGENTS.md` do app (nenhuma IA desliga a verificação) e o
contrato. Não é "impossível de burlar".
