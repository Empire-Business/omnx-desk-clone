# Guia de suporte — triagem de problemas no OMNX Desk

> Atualizado em: 06/08/2026 às 12h00 BRT
> Para quem recebe o problema e precisa decidir o que fazer com ele.
> Complementa `SISTEMA-DE-TICKETS.md`, que descreve como a captura funciona por
> dentro.

---

## Por onde o problema chega

| Canal | Onde ver | O que já vem junto |
|---|---|---|
| Botão "Reportar problema" | `/reportes` | Print da tela, rota, navegador, SO, console e rede do momento |
| E-mail automático | caixa dos admins | Resumo do reporte de categoria **bug** |
| `/saude` | painel de erros | Erros que o sistema registrou sozinho, mesmo sem ninguém reclamar |
| Mensagem direta (WhatsApp, ligação) | — | Nada. **Peça para reportar pelo botão** |

> Por que insistir no botão: a mensagem direta chega sem a tela, sem a rota e sem
> o erro técnico. Reconstruir isso pelo relato leva mais tempo do que o usuário
> gasta clicando no botão.

---

## Triagem em 4 passos

### 1. Dá para reproduzir?

Abra a rota que veio no reporte, com um usuário do mesmo **perfil**. Muito
problema é de permissão, e some quando você testa como admin.

- Reproduziu → `confirmado`
- Não reproduziu → `precisa_info` (pergunte o passo que falta) ou
  `nao_reproduzido`

### 2. É bug, dúvida ou pedido?

| Categoria | Destino |
|---|---|
| Bug | Correção. Segue o fluxo abaixo |
| Dúvida | Responda e aponte o [Manual do usuário](MANUAL-DO-USUARIO.md) |
| Sugestão | Vira item de roadmap, não correção |

### 3. Qual o impacto real?

Impacto é sobre a **operação**, não sobre o incômodo:

| Nível | Critério |
|---|---|
| `critico` | Trabalho parado, dado errado circulando ou dado de uma empresa visível para outra |
| `alto` | Uma função central inutilizável, com contorno ruim |
| `medio` | Atrapalha, mas há caminho alternativo |
| `baixo` | Cosmético |

**Vazamento entre empresas é sempre crítico**, mesmo que só uma pessoa tenha
visto. É o tipo de falha que não se conserta depois de acontecer.

### 4. Registre e devolva

Atualize status e prioridade, escreva a **resposta ao usuário** (ele lê em "Meus
reportes") e guarde a análise técnica na **nota interna** (ele não lê). Se houver
issue ou card, cole o link em `link_externo`.

---

## Problemas que se repetem — e a causa real

| Sintoma | Causa provável | Como confirmar |
|---|---|---|
| "Sumiu um item do menu" | App desligado em `/apps` ou permissão removida | Veja `/apps` e a matriz em `/admin` |
| "Vejo menos clientes que meu colega" | Não tem `clientes.carteira` | Matriz em `/admin` |
| "Não consigo editar colaborador" | Já foi recursão de policy (corrigido em 27/07/2026) | Erro de recursão infinita no console |
| "O valor no CRM está velho" | Ressincronização falhou | `vendas_pendentes.sincronizacao_erro` |
| "Não recebi o e-mail" | Secret ausente ou fila com erro | `email_queue` — status e coluna `erro` |
| Tela em branco depois de uma ação | Exceção não tratada | `/saude` → evento `erro_nao_tratado` na mesma rota e horário |

---

## Quando escalar para correção de código

Escale imediatamente, sem esperar mais relatos:

- qualquer suspeita de dado de uma empresa aparecendo em outra;
- erro que impede entrar no sistema;
- dado gravado errado (não apenas exibido errado) — quanto mais tarde, mais
  linhas para corrigir.

Ao escalar, leve: protocolo, rota, perfil do usuário, horário e o que aparece em
`/saude` naquele intervalo.

---

## O que nunca fazer no suporte

- **Pedir a senha do usuário.** Ninguém precisa dela para investigar.
- **Colar print com dado de cliente em canal externo.** O reporte já guarda o
  print dentro do sistema, com acesso controlado.
- **Corrigir dado direto no banco de produção** sem migration e sem registrar. O
  próximo relatório vai divergir e ninguém vai saber por quê.
