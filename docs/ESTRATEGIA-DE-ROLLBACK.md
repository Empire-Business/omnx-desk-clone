# Estratégia de rollback — OMNX Desk

> Atualizado em: 06/08/2026 às 12h00 BRT
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
