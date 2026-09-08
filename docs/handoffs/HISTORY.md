# Histórico de handoffs

> Registro cronológico das sessões, mais antigo primeiro. Na retomada, leia
> `latest.md` — este arquivo é auditoria.

---

## 2026-07-28 — Disparo por tag no CRM

> Atualizado em: 2026-07-28 18:20 BRT
> Estado: **funcionando ponta a ponta.** Falta só o workflow do lado do GHL.

## O que é

Um admin escolhe um recorte da base de **Contratos** (status, produto, tags), dá um nome de
tag e manda esse público para o CRM (GHL/Empire) etiquetado. O workflow do GHL que escuta a
tag é quem dispara a mensagem. **O Desk não envia mensagem nenhuma.**

## Estado atual

### ✅ No ar e testado

| Onde | O quê |
|---|---|
| Desk — front | `/disparo` (rota fora do menu, gate de admin) |
| Desk — edge | `disparo-enviar-ghl` **deployada** (`wuzmckatbmlpkdxtfhqr`) |
| Empire — edge | `crm-aplicar-tag` **deployada** (`qzesffnkqgelmtfblzkr`, verify_jwt=false) |
| Empire — banco | `chave_telefone_br()`, `crm_match_contatos_por_chave()` + índice em `contatos` |
| Ponte | secret por tenant no Vault dos dois lados (não usa mais o secret global) |

### ⏳ Falta

1. **Workflow no GHL** com gatilho *Contact Tag Added = `<tag>`*. Sem ele a tag entra e nada
   acontece. É configuração manual, no painel do GHL.
2. **UI da tela `/disparo`** — o Bruno pediu uma passada de design ("está muito feia").

## Como a coisa decide o que fazer

Match pela **chave canônica**: DDD + últimos 8 dígitos. Nunca pela string cheia, porque o
mesmo celular está gravado com e sem o nono dígito nas duas bases.

| Situação | Ação |
|---|---|
| 1 cadastro no CRM | aplica só a tag; não mexe em nome, e-mail nem telefone |
| 0 cadastros | procura na API do CRM; se não achar e `criar_novos=true`, cria em E.164 |
| >1 cadastro | **ambíguo** — não toca, devolve na lista para resolução manual |
| telefone inválido | descartado antes de sair do Desk |

**Cuidado que já custou um bug:** o espelho local de contatos do Empire guarda gente já
apagada no GHL. Confiar nele fazia essas pessoas contarem como "já existe", a tag falhar
calada e elas nunca receberem nada. Hoje cada candidato é conferido na API antes de decidir.

## Testes feitos (28/07, contra produção)

Contato de teste criado e apagado ao final; nenhuma pessoa real foi tocada.

- tag em contato existente → `marcados: 1`
- contato inexistente com `criar_novos` → criado e etiquetado
- `dry_run` → conta certo e **não escreve** (confirmado relendo as tags no CRM)
- máscara de telefone e tag com maiúscula/espaço → normalizados
- telefone com 2 cadastros → ambíguo, intocado

## Segurança / dívidas

- O secret da ponte foi gerado durante a sessão e apareceu no terminal. **Rotacionar quando
  der**: gerar novo, gravar no Vault do Empire (digest) e depois no Desk.
- `crm-aplicar-tag` não tem fallback para o secret global — é 401 sem workspace resolvido.
  As funções antigas continuam aceitando os dois caminhos.
- Tetos: 2.000 contatos por chamada no Desk, lotes de 200; 500 por chamada no Empire.

## Próximo dono

1. Configurar o workflow no GHL e rodar um disparo real com 3 contatos internos.
2. Refazer o visual de `/disparo`.

