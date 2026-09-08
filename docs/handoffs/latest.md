# Handoff — onde o trabalho parou

> Atualizado em: 04/08/2026 às 21h00 BRT
> Branch: **`feat/app-atendimento-social`** · 6 commits **locais, sem push**
> Referência de escopo: o brief de reestruturação → placar em
> [`../reestruturacao/ROADMAP-MODULARIZACAO.md`](../reestruturacao/ROADMAP-MODULARIZACAO.md)

---

## 1. Antes de qualquer coisa, cheque isto

**A branch muda sob os pés.** Este clone é usado por sessões paralelas. Já
aconteceu de a branch trocar no meio do trabalho e de um cherry-pick ficar
travado por conflito. Rode **sempre** antes de commitar ou publicar:

```bash
git status -sb && git log --oneline -3
```

Se aparecer cherry-pick/merge em andamento, **pare e pergunte ao usuário** — não
resolva por conta própria.

---

## 2. O que foi entregue nesta sessão

| Commit | O quê |
|---|---|
| `5ec0729` | App **Atendimento** (5 tabelas, painel, lista, kanban, detalhe, config) + catálogo de apps enxuto |
| `c35ee00` | Atendimento vira **tela inicial**; Dashboard vira legado; **segmento por empresa** |
| `30c1714` | PRD ganha §0 (estado atual); roadmap ganha o placar do brief |
| `eb233a1` | `MAPA-DE-NAVEGACAO.md` novo; `PROGRESS.md` em dia |
| `962e446` | Reporte de erro: **captura automática** de tela, console e rede (+6 testes) |
| `8d5d5cc` | **15 gates de admin** migrados para a matriz de permissões |

Migrations aplicadas em produção (via Management API, já conferidas no banco):
`20260804130000`, `140000`, `160000`, `180000`, `190000`, `200000`.

---

## 3. Decisões tomadas com o usuário (não reabrir sem motivo)

- **Atendimento é a tela inicial**, com o ícone do Dashboard. O Dashboard antigo
  **não foi apagado** — vive em `/dashboard-legado`, fora do menu.
- **Loja de Apps tem 3 apps**: Atendimento, Chat, Contratos. Dashboard é `nucleo`;
  Cobrança e Portal são `arquivado` (desligados) e **não aparecem na tela** — o
  usuário pediu explicitamente para tirar a seção "Apps arquivados".
- **Segmento por empresa**: Social Media, Clínica, Escritório. Muda abas,
  métricas e vocabulário. Trocar de ramo é **aditivo** (nunca apaga etapa/tipo).
- **Apps nascem ligados**, ao contrário do §7 do brief — o sistema está em
  produção e o contrário tiraria acesso de quem usa.
- **`/admin` continua preso a `perfil === 'admin'`**: é a tela que edita a
  própria matriz.

---

## 4. O que falta — por impacto

1. **Testes (§16–17 do brief).** Maior lacuna. Hoje: 63 testes, todos unitários.
   **Zero** teste de isolamento entre empresas e zero E2E. Num multi-tenant com
   2 empresas em produção, é a garantia que mais falta.
2. **16 gates `admin || gerente` (§15).** Não são gate de admin — decidem quem vê
   a carteira inteira (todos os clientes, todas as conversas). Migrar muda acesso
   de verdade: **exige decisão de produto**, caso a caso. Lista completa em
   `reestruturacao/NIVEIS-DE-ACESSO.md` §6.
3. **UX de Chat e Contratos (§8–9).** Não iniciada — e era o motivo original do
   brief. O Atendimento já nasceu sob os 10 princípios; os outros dois não.
4. **Observabilidade (§19).** Sem logs estruturados nem métricas por módulo.
5. **Cadastro central (§6).** Falta a tela do cliente com todos os vínculos
   (contratos, produtos, financeiro, conversas, demandas) num lugar só.
6. **Notificação de reporte novo.** A triagem depende de alguém abrir
   `/reportes`. Caminho natural: reaproveitar a edge function `send-email`.
7. **Docs que faltam (§5):** manual do usuário, manual de administração, guia de
   suporte, estratégia de rollback, plano de homologação.

---

## 5. Pendências específicas do que foi feito hoje

- **Troca de segmento não foi executada**, só verificada por leitura do SQL.
  Testar com um tenant de teste antes de considerar fechada.
- **Anexo de demanda**: bucket `atendimento-anexos`, policies e coluna `anexos`
  existem, mas **a tela não envia arquivo** ainda.
- **Reordenar etapas por arraste**: a coluna `ordem` existe; a tela de
  configuração só acrescenta no fim.
- **Vínculo Atendimento × Chat**: criar demanda a partir de uma conversa não
  existe. Era parte da ideia original da Fase 4.
- **Lint**: 4 erros pré-existentes em `DepartamentosPage` e `DisparoPage`
  (confirmado com `stash` que não vieram desta sessão).

---

## 6. Como validar antes de publicar

```bash
npx tsc --noEmit     # precisa sair limpo
npx vitest run       # 63 testes, 8 arquivos
npx vite build
```

Gates da skill que **ainda bloqueiam deploy** (`/security-auditor` não roda desde
27/07): rodar a auditoria antes de qualquer merge em `main`.

---

## 7. Próximo passo recomendado

Perguntar ao usuário se publica a branch (`git push` + PR) ou se segue para os
**16 gates `admin || gerente`**, decidindo caso a caso o que cada um vira.

## Referências

- Placar do brief: `docs/reestruturacao/ROADMAP-MODULARIZACAO.md`
- Permissões: `docs/reestruturacao/NIVEIS-DE-ACESSO.md`
- Telas e proteções: `docs/MAPA-DE-NAVEGACAO.md`
- Tickets de erro: `docs/SISTEMA-DE-TICKETS.md`
- Entidades: `docs/UML.md` · `docs/UML.html`
- Histórico: `docs/MUDANCAS.md` · `docs/PROGRESS.md`
