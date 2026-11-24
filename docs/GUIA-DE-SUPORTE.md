# Guia de suporte — triagem de problemas no OMNX Desk

> Atualizado em: 26/10/2026 às 17h18 BRT — triagem das Automações WhatsApp.
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

## Automações WhatsApp (`/automacoes-wa`)

Primeiro, confirme **o que deveria ter chegado e para quem**:

| Mensagem | Destinatário certo |
|---|---|
| Aviso diário | Gestor, no privado (clientes que pedem atenção + reuniões do dia) |
| Resumo semanal | **Cliente**, no grupo dele ou no privado dele (assuntos e próximos passos) |
| Link da reunião | Grupo do cliente |

Se um gestor recebeu "resumo semanal" no privado, é a versão antiga da função
(antes da refação de 26/10/2026) com o modo privado ligado — desligue o resumo e
escale.

O primeiro lugar a olhar é sempre a aba **Histórico** (`/automacoes-wa/historico`):
cada envio ou tentativa vira uma linha com status e motivo.

| Sintoma | Causa provável | Como confirmar |
|---|---|---|
| "Não chegou nada" e o Histórico está vazio | Interruptor desligado, horário ainda não passou, nenhum gestor ativo ou app desligado em `/apps` | Abas Alertas/Resumo/Gestores e `/apps`. O agendador roda a cada 15 min; o diário tenta até 3 h depois do horário |
| Histórico `falhou` · "Salve o token da UAZAPI…" / "Salve a chave da Zernio…" | Token/chave não salvo, ou foi revogado | Aba Conexão mostra o status |
| `falhou` · "Token da UAZAPI recusado" / "Chave da Zernio recusada" | Token trocado no provedor, ou token de **outro** número | Salvar de novo o token do número escolhido |
| `falhou` · "A API oficial só envia com modelo aprovado" | Zernio sem o nome do modelo na aba Conexão | Campos "Modelo do aviso diário" / "do resumo semanal" |
| `falhou` · "Modelo não encontrado na Zernio" | Nome ou idioma do modelo diferente do aprovado | Comparar com o painel da Zernio (minúsculas, `_`, idioma `pt_BR`) |
| `falhou` · "janela de 24h está fechada" | Tentativa de texto livre pela oficial | Deve sair por modelo; escalar se persistir |
| `falhou` · "Muitas mensagens para o mesmo número" | Limite da Meta por destinatário (~10/min) | Aguardar; a próxima rodada tenta |
| "Os envios estão pausados" | **Disjuntor**: 5 falhas seguidas em 15 min naquele provedor | Corrigir a causa das falhas; volta sozinho depois de 15 min |
| `falhou` · `sem_assunto` no resumo semanal | Pouca conversa na semana com aquele cliente — **não é erro** | Nada a fazer; não conta para o disjuntor |
| `falhou` · `falha_ia` | IA fora do ar ou resposta inválida | Tenta até 3 vezes no dia; se repetir em vários dias, escalar |
| Resumo semanal não sai no grupo, empresa na Zernio | A oficial não abre conversa de grupo | Esperado (`oficial_sem_grupo`); usar UAZAPI para grupo |
| Link não sai: "Nenhum grupo de WhatsApp vinculado a <cliente>" | Grupo não ligado ao cliente no Chat, ou está em outro número | Vincular o grupo ao cliente no Chat, no número da aba Conexão |
| Link: "Este cliente tem mais de um grupo" | Escolha obrigatória | Escolher o grupo na tela |
| Link: "pode ter chegado… confirme o reenvio" | Timeout: o WhatsApp pode ter recebido | Conferir o grupo **antes** de reenviar com confirmação |
| Link: "já foi enviado" | Cada reunião só manda o link uma vez | Esperado |
| "Sem permissão" ao salvar token / testar / prévia | Exige **perfil** `admin`, não só a permissão da matriz | `/colaboradores` (perfil) |
| "Limite de 5 testes por hora" / "20 prévias" / "20 links por hora" | Limites de proteção por empresa | Esperar a hora virar |

**Consultas úteis (técnico, só leitura):**

```sql
-- Últimos envios de uma empresa
select created_at, tipo, provider, status, erro, destino_nome
  from public.wa_auto_envios
 where tenant_id = '<uuid>'
 order by created_at desc limit 50;

-- O agendador está rodando?
select jobname, schedule, active from cron.job where jobname like 'wa-auto-%';
select j.jobname, d.status, d.start_time, d.return_message
  from cron.job_run_details d join cron.job j using (jobid)
 where j.jobname like 'wa-auto-%'
 order by d.start_time desc limit 20;
```

> O agendador só chama a função se **alguma** empresa tiver a automação ligada.
> Função de cron respondendo **401** = segredo não confere ou a função foi
> publicada sem `verify_jwt = false` (ver `ESTRATEGIA-DE-ROLLBACK.md`).

Nunca peça ao cliente o token da UAZAPI ou a chave da Zernio por mensagem: ele
cola direto na aba Conexão. O Histórico nunca mostra token nem texto de conversa
— se aparecer, é **crítico**.

Mensagem enviada para o **cliente ou grupo de outra empresa** é vazamento entre
empresas: **crítico**, desligue o app da empresa em `/apps` e escale na hora.

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
