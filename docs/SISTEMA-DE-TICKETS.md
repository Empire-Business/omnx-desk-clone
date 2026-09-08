# Sistema de tickets de erro — OMNX Desk

> Como o usuário reporta um problema, o que é capturado automaticamente e como a
> equipe trata. Atualizado em: 04/08/2026 às 20h30 BRT

---

## 1. Como o usuário reporta

Um **botão flutuante azul** ("Reportar problema") fica visível em qualquer tela
do sistema, no canto inferior direito. Um clique abre o formulário.

O usuário preenche o que quiser: título (único obrigatório), descrição, passos
para reproduzir, resultado esperado e ocorrido, impacto e categoria. Tudo em
linguagem comum — ele nunca precisa saber o que é console, rota ou user agent.

---

## 2. O que é capturado automaticamente

Esta é a parte que transforma um relato em diagnóstico. Nada disso é digitado
pelo usuário.

| O quê | Como | Observação |
|---|---|---|
| **Foto da tela** | `html2canvas` sobre o DOM, no clique do botão | Tirada **antes** do modal abrir — senão fotografaria o formulário, não o problema |
| **Console** | Ring buffer das últimas ~120 entradas | Interceptor instalado no **boot** (`main.tsx`) |
| **Rede** | Últimas ~40 requisições: método, URL, status, duração | **Nunca** corpo de requisição ou resposta |
| **Erros não tratados** | `window.onerror` + `unhandledrejection` | Entram no buffer de console |
| **Ambiente** | Navegador, SO, dispositivo, viewport, idioma, rota | `lib/reporte-contexto.ts` |
| **Identificação** | Usuário, e-mail, empresa (via RLS) | |

### Por que o interceptor roda desde o boot

O JavaScript **não recupera** o que já foi impresso no console. Se a captura
começasse quando o usuário clica em "Reportar problema", o campo de logs chegaria
sempre vazio — o erro já teria acontecido e passado. Por isso
`instalarCapturaDeContexto()` é chamado em `src/main.tsx`, antes de qualquer
tela renderizar.

### Privacidade

- **Mascarado antes de guardar:** senha, token, `api_key`, `secret`,
  `Authorization`, Bearer e JWT — em qualquer formato (`chave: valor`,
  `chave=valor`, JSON).
- **Nunca capturado:** corpo de requisição/resposta, cookies, `localStorage`.
- **Truncado:** cada entrada tem teto de 800 caracteres; log gigante não vira
  dump de dados do cliente.
- **A foto é visível antes de enviar.** O usuário vê a prévia no formulário e
  pode clicar em "Não enviar a foto". Captura silenciosa de uma tela que pode
  ter dado de cliente seria desconfortável.

Coberto por testes em `src/lib/reporte-buffers.test.ts` — inclusive a asserção
de que senha e JWT **não** aparecem no buffer.

---

## 3. Onde os tickets ficam

Tabela `reportes_erro`, multi-tenant com RLS:

- o autor vê e acompanha **os próprios** reportes (`/meus-reportes`);
- o admin vê e tria **todos os do seu tenant** (`/reportes`);
- ninguém vê os de outra empresa.

Cada reporte recebe um **protocolo** legível (`ERR-00042`), gerado pelo banco.

Colunas relevantes: `console_logs` e `network_logs` (jsonb), `anexos` (jsonb,
bucket privado `reportes-anexos`), `contexto` (jsonb).

---

## 4. Fluxo de status

```
recebido → em_triagem → confirmado → em_desenvolvimento → em_validacao → corrigido
                     ↘ precisa_info                                    ↘ encerrado
                     ↘ nao_reproduzido
                     ↘ duplicado
```

Na triagem (`/reportes`) o admin ajusta status e prioridade, escreve uma **nota
interna** (o autor não vê), uma **resposta ao usuário** (o autor vê) e pode colar
o **link externo** do issue onde a correção é acompanhada.

Os logs de console e de rede aparecem na tela de triagem, recolhidos, com erros
destacados em vermelho.

---

## 5. Retorno ao usuário

Ao enviar, ele recebe o **protocolo** na hora. Em `/meus-reportes` acompanha o
andamento, com o status escrito em linguagem de usuário e a resposta da equipe
quando houver. A nota interna de triagem nunca aparece para ele.

Nenhum prazo automático de resolução é prometido — não existe regra formal de SLA
para isso.

---

## 6. Notificações

Hoje **não há** notificação automática para a equipe quando um reporte entra: a
triagem depende de alguém abrir `/reportes`. É uma lacuna conhecida — o caminho
natural é reaproveitar a edge function `send-email` (Resend), como já é feito no
aviso de contrato assinado.

---

## 7. Arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/reporte-buffers.ts` | Interceptor de console/rede + mascaramento |
| `src/lib/reporte-buffers.test.ts` | Testes da captura e da privacidade |
| `src/lib/reporte-captura.ts` | Foto da tela (html2canvas) |
| `src/lib/reporte-contexto.ts` | Metadados do ambiente |
| `src/components/suporte/ReportarProblema.tsx` | Botão flutuante + formulário |
| `src/pages/ReportesPage.tsx` | Painel de triagem (admin) |
| `src/pages/MeusReportesPage.tsx` | Acompanhamento do autor |
| `src/hooks/useReportes.ts` | Consultas e mutações |
