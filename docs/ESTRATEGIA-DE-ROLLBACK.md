# Estratégia de rollback — OMNX Desk

> Atualizado em: 27/10/2026 às 09h26 BRT — rollback da Íris e da nova arquitetura de satisfação (vínculos, autoria, transcrição, relacionamento).
> Como desfazer uma entrega que deu errado, por camada. O sistema está em
> produção com empresas reais: rollback é procedimento, não improviso.

---

## A regra que evita a maioria dos rollbacks

**Aditivo antes de destrutivo.** Toda mudança começa reversível — esconder do
menu antes de remover a rota, remover a rota antes de apagar a tela, apagar a
tela antes (muito antes) de dropar a tabela. Quando cada passo é reversível, o
rollback quase nunca precisa chegar no banco.

---

## Camada 1 — Frontend (Vercel)

**Sintoma:** tela quebrada, branca ou com erro logo após um deploy.

1. Painel do Vercel → **Deployments**.
2. Ache o último deploy bom (o anterior ao incidente).
3. **Promote to Production**.

Leva menos de um minuto e não toca no banco. É sempre a primeira tentativa: se o
problema é de tela, acabou aqui.

Em seguida, no repositório: `git revert <commit>` na `main`. Sem isso, o próximo
deploy traz o problema de volta.

---

## Camada 2 — Edge functions

**Sintoma:** integração parou (CRM, e-mail, contrato, webhook), mas as telas
funcionam.

Redeploy da versão anterior da função:

```bash
git checkout <commit-bom> -- supabase/functions/<funcao>
supabase functions deploy <funcao>
```

⚠️ **Armadilha conhecida:** as funções `crm-*` (projeto do CRM) precisam ficar com
`verify_jwt = false`. Um redeploy sem a flag religa o JWT e a ponte passa a
responder 401 — parece problema de integração, é configuração de deploy.

---

## Camada 3 — Banco de dados

É a camada perigosa. Cada migration nova **precisa** trazer, no cabeçalho, o
comando que a desfaz — as recentes trazem.

| Tipo de mudança | Como desfazer | Perde dado? |
|---|---|---|
| Tabela nova | `DROP TABLE ... CASCADE` | Só o que foi gravado nela |
| Coluna nova | `ALTER TABLE ... DROP COLUMN` | Só o conteúdo da coluna |
| Trigger/função nova | `DROP TRIGGER` / `DROP FUNCTION` | Não |
| Linha de permissão | `DELETE` das linhas semeadas | Não |
| Policy de RLS alterada | Recriar a policy anterior | Não |
| **Coluna removida / dado apagado** | **Só restaurando backup** | **Sim** |

### Rollback das entregas de 06/08/2026

```sql
-- Notificação de reporte novo
drop trigger if exists trg_notificar_reporte_novo on public.reportes_erro;
drop function if exists public.tg_notificar_reporte_novo();

-- Permissões de carteira (o front volta ao gate legado sozinho)
delete from public.permissoes_app
 where recurso in ('clientes.carteira','clientes.atribuir','chat.carteira');

-- Observabilidade
drop table if exists public.app_logs cascade;
drop function if exists public.resumo_saude_apps(integer);
```

> A remoção das permissões é segura por desenho: `usePermissoes` cai no gate
> legado quando a regra não existe, então ninguém fica sem acesso no intervalo.

### Rollback do App Automações WhatsApp (Fase 9, 26/10/2026)

Este app **manda mensagens para gestores e clientes** — o aviso diário vai ao
gestor no privado; o resumo semanal vai ao **cliente** (grupo ou privado dele);
o link de reunião vai ao grupo do cliente. Se algo sair errado, a prioridade é
**parar o envio** (degraus 1–2); desfazer banco é o último degrau. Suba um degrau
só se o anterior não resolveu.

**Degrau 1 — Desligar pela tela (qualquer admin, segundos, sem perda).**

- Uma automação: interruptor em `/automacoes-wa/relatorio` (diário),
  `/automacoes-wa/resumo` (semanal), `/automacoes-wa/reunioes` ou
  `/automacoes-wa/assistente` (Íris — efeito imediato).
- A empresa inteira: desligar o app em `/apps`. As funções conferem
  `app_modules.enabled` e não enviam nada, inclusive pelo cron.

**Degrau 2 — Desligar para todas as empresas (técnico, emergência).**

```sql
-- 2a) Desliga as três automações em todas as empresas (os jobs param de chamar as funções)
update public.wa_auto_config
   set relatorio_ativo = false, resumo_ativo = false, agendamento_ativo = false;

-- 2b) Tira os 3 jobs do agendador
select cron.unschedule('wa-auto-relatorio-diario-15min');
select cron.unschedule('wa-auto-resumo-semanal-15min');
select cron.unschedule('wa-auto-envios-retencao-90d');
-- conferir: não deve sobrar nada
select jobname from cron.job where jobname like 'wa-auto-%';
```

> 2a é ajuste de dado em emergência: registre em `MUDANCAS.md` o que foi
> desligado e quando. Para religar os jobs, reaplique as migrations
> `20261026160000` (diário + retenção) e `20261026170000` (semanal) — elas
> recriam os jobs pelo nome.

**Degrau 3 — Edge functions.** Voltar uma versão ou retirar do ar:

```bash
git checkout <commit-bom> -- supabase/functions/<funcao> supabase/functions/_shared
supabase functions deploy <funcao> --project-ref wuzmckatbmlpkdxtfhqr
# ou retirar do ar:
supabase functions delete <funcao> --project-ref wuzmckatbmlpkdxtfhqr
```

Funções: `wa-auto-testar-envio`, `wa-auto-backtest`, `wa-auto-agendar`,
`wa-auto-relatorio-diario`, `wa-auto-resumo-semanal`.

⚠️ `wa-auto-relatorio-diario` e `wa-auto-resumo-semanal` **precisam** de
`verify_jwt = false` (entrada no `supabase/config.toml` ou `--no-verify-jwt`). Sem
isso, o cron recebe 401 e nada sai — parece rollback que funcionou, mas é
configuração. As outras três ficam no padrão (`true`).

**Degrau 4 — Banco (só com o dono do produto ciente; ordem inversa).** Cada
migration traz a reversão no cabeçalho; resumo (se o degrau 2b já rodou, pule os
`cron.unschedule` — eles dão erro quando o job não existe mais):

```sql
-- 20261026180000 — trava "1 link por reunião"
drop index if exists public.uq_wa_auto_envios_agendamento_reuniao;

-- 20261026170000 — job do resumo semanal
select cron.unschedule('wa-auto-resumo-semanal-15min');

-- 20261026160000 — job do diário, retenção, RPCs e segredo do cron
select cron.unschedule('wa-auto-relatorio-diario-15min');
select cron.unschedule('wa-auto-envios-retencao-90d');
drop function if exists public.wa_auto_queda_volume(uuid, numeric, timestamptz);
drop function if exists public.wa_auto_cron_secret_confere(text);
delete from vault.secrets where name = 'wa_auto_cron_secret';

-- 20261026140000 — cofre aceitando uazapi/zernio (APAGA tokens/chaves salvos)
delete from vault.secrets where id in (select secret_key_id from public.tenant_integracoes
                                       where provider in ('uazapi','zernio'));
delete from public.tenant_integracoes where provider in ('uazapi','zernio');
alter table public.tenant_integracoes drop constraint if exists tenant_integracoes_base_url_wa_check;
alter table public.tenant_integracoes drop constraint if exists tenant_integracoes_provider_check;
alter table public.tenant_integracoes add constraint tenant_integracoes_provider_check
  check (provider in ('empire'));
drop function if exists public.wa_base_url_permitida(text, text);
alter table public.wa_auto_config drop column if exists template_idioma;
-- + reaplicar o corpo de save_omnx_integracao_secret da migration 20260722000000

-- 20261026120000 — fundação (APAGA configuração, gestores, regras e histórico)
drop trigger if exists seed_wa_auto_on_tenant_insert on public.tenants;
drop function if exists public.seed_wa_auto_on_tenant_insert();
drop function if exists public.seed_wa_auto_for_tenant(uuid);
drop table if exists public.wa_auto_envios, public.wa_auto_regras_anomalia,
                     public.wa_auto_gestores, public.wa_auto_config cascade;
drop function if exists public.wa_auto_confere_instancia();
drop function if exists public.wa_auto_limita_gestores();
drop function if exists public.wa_auto_touch_updated_at();
delete from public.app_modules where slug = 'automacoes-wa';
-- + reaplicar seed_app_modules_for_tenant da migration 20260804190000
--   (a versão nova inclui o app na lista de empresas novas)
```

| Passo | Perde dado? |
|---|---|
| Degraus 1–3 | Não |
| Reverter `…180000`, `…170000`, `…160000` | Não (só o segredo do cron, que é regerado ao reaplicar) |
| Reverter `…140000` | **Sim** — tokens UAZAPI e chaves Zernio salvos (precisam ser colados de novo) |
| Reverter `…120000` | **Sim** — configuração, gestores, regras e histórico de envios |

> O front (`/automacoes-wa`) depende das tabelas da `…120000`: antes de reverter
> essa migration, desligue o app em `/apps` ou volte o front (Camada 1).
> Reuniões marcadas pela Etapa 1 ficam em `meetings` (`metadata.origem =
> 'automacoes-wa'`) e **não** são apagadas por nenhum passo acima.

### Rollback da Íris e da nova arquitetura de satisfação (27/10/2026)

Mesma lógica de degraus: **primeiro parar** (Íris calada, jobs parados), depois
voltar o comportamento antigo, e só no fim mexer em tabela. As tabelas novas
são **aditivas** — deixá-las paradas no banco não atrapalha nada.

**Degrau 1 — Íris calada (segundos).** Aba Assistente → desligar "Ligar o
assistente". Emergência para todas as empresas:

```sql
update public.wa_auto_config set agente_ativo = false;
```

Se o problema for o webhook protegido (mensagens não chegando ao Chat): no painel
da UAZAPI, volte a URL do webhook do número para
`…/functions/v1/uazapi-webhook` (sem `/k/<token>`). O webhook aceita sem token;
só a Íris deixa de ser acionada.

**Degrau 2 — Parar os jobs novos e religar a análise antiga.**

```sql
select cron.unschedule('wa-agente-varredura-1min');            -- Íris (varredura)
select cron.unschedule('wa-midia-processar-5min');             -- transcrição
select cron.unschedule('wa-vinculos-sugerir-diario');          -- sugestões 06:30
select cron.unschedule('wa-relacionamento-analisar-diario');   -- análise por cliente
-- conferir:
select jobname from cron.job where jobname like 'wa-%';

-- Religar a análise antiga por conversa (mesmo comando da migration 20261026240000;
-- está no cabeçalho da 20261027150000):
select cron.schedule('wa-auto-satisfacao-diaria', '*/15 9-10 * * *', $cron$
  select net.http_post(
    url := 'https://wuzmckatbmlpkdxtfhqr.supabase.co/functions/v1/wa-auto-satisfacao',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s.decrypted_secret),
    body := '{}'::jsonb, timeout_milliseconds := 150000)
  from vault.decrypted_secrets s
  where s.name = 'wa_auto_cron_secret'
    and exists (select 1 from public.wa_auto_config c
                  join public.wa_auto_regras_anomalia r
                    on r.tenant_id = c.tenant_id and r.tipo = 'sentimento_negativo' and r.ativo
                 where c.relatorio_ativo);
$cron$);
```

> O relatório diário volta **sozinho** a ler `wa_auto_satisfacao` quando
> `cliente_relacionamento` não tem nenhuma análise dos últimos 3 dias (ou quando a
> tabela não existe). Ou seja: parado o job novo, em até 3 dias o relatório já usa
> a análise antiga religada acima.

**Degrau 3 — Edge functions.** Mesmo procedimento do App Automações (checkout do
commit bom + deploy). Funções novas: `wa-agente-responder`, `wa-agente-admin`,
`wa-vinculos-sugerir`, `wa-midia-processar`, `wa-relacionamento-analisar`; e
alteradas: `uazapi-webhook`, `wa-auto-relatorio-diario`, `wa-auto-backtest`.
Precisam de `verify_jwt = false`: `uazapi-webhook`, `wa-agente-responder`,
`wa-vinculos-sugerir`, `wa-midia-processar`, `wa-relacionamento-analisar` e
`wa-auto-relatorio-diario`. `wa-agente-admin` e `wa-auto-backtest` ficam no padrão (`true`).

**Degrau 4 — Vínculos de volta ao estado de antes.** A migration
`20261027110000` guardou uma **cópia de segurança** dos vínculos antigos em
`private.backup_vinculos_20261027_contatos` e `…_juncao`. Rodar no SQL editor
(sem sessão), de preferência logo depois da publicação — **apaga também
vínculos feitos no Chat depois dela**; contatos criados depois ficam como estão:

```sql
begin;
select cron.unschedule('wa-vinculos-sugerir-diario');
drop table if exists public.cliente_canais cascade;  -- para de sincronizar
select set_config('omnx.vinculo_sync', 'on', true);
update public.chat_contacts c set client_id = b.client_id
  from private.backup_vinculos_20261027_contatos b
 where b.id = c.id and c.client_id is distinct from b.client_id
   and (b.client_id is null or exists (select 1 from public.clients cl where cl.id = b.client_id));
delete from public.chat_contact_clients cc
 where not exists (select 1 from private.backup_vinculos_20261027_juncao b where b.id = cc.id)
   and exists (select 1 from private.backup_vinculos_20261027_contatos b where b.id = cc.contact_id);
insert into public.chat_contact_clients (id, contact_id, client_id, tenant_id, criado_em)
select b.id, b.contact_id, b.client_id, b.tenant_id, b.criado_em
  from private.backup_vinculos_20261027_juncao b
 where exists (select 1 from public.chat_contacts c where c.id = b.contact_id)
   and exists (select 1 from public.clients cl where cl.id = b.client_id)
on conflict do nothing;
commit;
```

> **Não** volte a versão antiga de `match_contact_to_client`: ela não tinha filtro
> de empresa (falha de segurança). Fica a nova.

**Degrau 5 — Banco (só com o dono ciente; ordem inversa).** Cada migration traz
a reversão completa no cabeçalho:

| Migration | O que desfaz | Perde dado? |
|---|---|---|
| `20261027150000` | Relacionamento por cliente, RPC de grupos sem cliente, alerta `grupo_sem_cliente` | Sim — memória e histórico da análise por cliente |
| `20261027140000` | Linha do tempo (só funções de leitura) | Não |
| `20261027130000` | Fila e textos de transcrição | Sim — transcrições já feitas |
| `20261027120000` | Autoria e `equipe_identidades`; recriar o `update_aguardando_resposta` antigo (corpo no comentário da seção 5 da migration) | Sim — WhatsApp pessoal cadastrado e autoria gravada |
| `20261027110000` | `cliente_canais` (use antes o degrau 4) | Sim — decisões da aba Vínculos |
| `20261027101000` | Aprendizados da Íris | Sim — preferências ensinadas |
| `20261027100000` | Opções do relatório (estrategista, só ativos) | Não (volta ao comportamento antigo) |
| `20261027091000` / `20261027090000` | Boas-vindas / base da Íris (tokens do webhook, membros, grupos, fila, log) | Sim — configuração da Íris; grupos marcados como restritos **continuam** restritos |

---

## Camada 4 — Dados corrompidos por uma entrega

Pior caso: a entrega rodou e gravou dado errado. Ordem obrigatória:

1. **Pare a fonte** (desligue o trigger ou o app) antes de qualquer correção. Sem
   isso, você corrige e ele reescreve.
2. **Meça o estrago** — quantas linhas, desde quando. Anote a consulta usada.
3. **Salve o estado atual** (`CREATE TABLE ..._backup_YYYYMMDD AS SELECT ...`)
   antes de corrigir. Rollback do rollback também precisa existir.
4. **Corrija por migration**, nunca por SQL solto no painel.
5. **Confirme** com a mesma consulta do passo 2.

---

## Antes de qualquer deploy que mexa em banco ou auth

- [ ] A migration tem o comando de rollback escrito no cabeçalho?
- [ ] `npm run typecheck` passou? (`npx tsc --noEmit` **não** valida nada neste
      projeto — o `tsconfig` da raiz é só um índice)
- [ ] Testado em branch/preview com um usuário de cada perfil afetado?
- [ ] Alguém sabe que o deploy vai acontecer e a que horas?
- [ ] Dá para desfazer sem perder dado? Se não, por que não?

---

## Quem decide

Rollback de frontend: qualquer pessoa com acesso ao Vercel, na hora, sem pedir
autorização. Perder 20 minutos discutindo com a tela quebrada é pior que voltar
uma versão à toa.

Rollback de banco: só com o dono do produto ciente. É a camada onde desfazer pode
custar mais que o problema original.
