# Manual do usuário — OMNX Desk

> Atualizado em: 06/08/2026 às 12h00 BRT
> Para quem **usa** o sistema no dia a dia. Se você administra a conta (cria
> gente, liga apps, define permissões), veja também o
> [Manual de administração](MANUAL-DE-ADMINISTRACAO.md).

---

## O que é o OMNX Desk

É onde a operação com o cliente acontece: o pedido que ele fez, a conversa no
WhatsApp, o contrato que assinou e o dinheiro que ainda vai entrar. Antes, cada
uma dessas coisas vivia num lugar diferente (ou no WhatsApp de alguém).

O sistema é dividido em **apps**. Cada empresa liga só os que usa, então é normal
você não ver aqui alguma tela descrita neste manual — significa que o app está
desligado ou que seu perfil não tem acesso.

| App | Para que serve |
|---|---|
| **Atendimento** | Registrar e acompanhar o que o cliente pediu. É a tela inicial |
| **Chat** | Conversas de WhatsApp |
| **Contratos** | Contratos, vendas novas e o que há a receber |

Fora dos apps existe o **núcleo**, que nunca desliga: Clientes, Colaboradores,
Produtos, Configurações.

---

## Primeiro acesso

1. Você recebe um e-mail com seu endereço de acesso.
2. Entre em **desk.omnx.pro** com seu e-mail e a senha que o administrador
   definiu.
3. Troque a senha em **Configurações → Perfil**. A senha inicial é a mesma para
   todo mundo — enquanto você não trocar, ela não protege nada.
4. Se esquecer a senha, use "Esqueci minha senha" na tela de entrada. O link
   chega por e-mail e vale por pouco tempo.

---

## Atendimento — o dia a dia

A tela inicial responde uma pergunta: **o que precisa de mim agora?**

- **Atrasadas** — passou do prazo. Começa por aqui.
- **Vencem hoje / em 7 dias** — o que está chegando.
- **Esperando o cliente** — está pronto, mas parado aguardando resposta dele.
- **Cliente pediu ajustes** — voltou para você.

### Registrar um pedido do cliente

1. Clique em **Nova demanda** (o nome muda conforme o ramo da empresa: numa
   clínica é "Novo atendimento").
2. Preencha: título, cliente, tipo, responsável e prazo.
3. Salve. A demanda entra na primeira etapa do fluxo.

> **Por que registrar?** Um pedido que só existe na conversa do WhatsApp some
> quando a conversa rola. Registrado, ele tem dono, prazo e histórico.

### Tocar a demanda

- **Lista** — para procurar algo específico (busca por título ou código).
- **Kanban** — arraste o cartão para a próxima etapa conforme o trabalho anda.
- **Detalhe** — comentários, aprovação do cliente e histórico do que mudou.

### Sentimental

Leitura automática das conversas: como o cliente está se sentindo, o que pediu e
o que ficou pendente. Aparece só se o app de Chat estiver ligado — é dele que
vêm as conversas analisadas.

---

## Chat

- **Inbox** — suas conversas. As abas separam o que é seu do que é da equipe.
- **Anotações** — o que a equipe registrou sobre o cliente.
- **Kanban** — conversas organizadas por etapa.
- **Contatos** — os números e a quem cada um pertence.

O que você vê depende do seu perfil: quem não tem "ver todas as conversas" só
enxerga as conversas dos clientes atribuídos a si. Isso não é falha — é a regra
de acesso da sua empresa, e o administrador pode mudá-la.

---

## Contratos

As abas seguem a ordem do trabalho:

1. **Dashboard** — o retrato do módulo.
2. **Onboarding** — vendas novas que chegaram pelo formulário e ainda viram
   contrato.
3. **Contratos** — a lista completa, com filtros.
4. **Kanban** — em que etapa cada contrato está.
5. **Recebíveis** — parcelas a receber, mês a mês.

Depois da divisória ficam **Produtos** e **Tags**: são configuração do módulo,
não trabalho diário, e só aparecem para quem administra.

### Do formulário de venda ao contrato

1. O vendedor preenche o formulário público de venda.
2. A venda aparece em **Onboarding**.
3. Alguém confere os dados e promove a contrato.
4. Quando o contrato é assinado no Clicksign, ele vira **ATIVO** sozinho e a
   equipe é avisada por e-mail.

---

## Clientes — a ficha completa

`Clientes → um cliente` reúne tudo que existe sobre ele:

| Aba | O que mostra |
|---|---|
| Contratos | Todos os contratos, ativos e encerrados |
| Produtos | O que ele comprou |
| **Financeiro** | Parcelas que venceram e as que ainda vão vencer |
| **Conversas** | As conversas de WhatsApp dos contatos dele |
| **Demandas** | O que ele pediu, aberto e concluído |
| Outros contatos | Demais números ligados ao mesmo cliente |

Cada aba é um índice: clique e você vai para o app que é dono daquele dado.

---

## Quando algo dá errado

Use o botão **Reportar problema** (canto da tela). Ele já captura sozinho a tela,
a rota, o navegador e os erros técnicos do momento — você não precisa saber
descrever nada disso.

Descreva com suas palavras:

- o que você estava tentando fazer;
- o que aconteceu;
- o que você esperava que acontecesse.

Você recebe um **protocolo** (ex.: `ERR-00042`) e acompanha o andamento em
**Meus reportes**. Senhas e tokens nunca são capturados.

---

## Perguntas frequentes

**Sumiu um item do menu que eu usava.**
Ou o app foi desligado para a empresa, ou seu perfil deixou de ter permissão.
Fale com o administrador da conta — nenhum dado é apagado quando um app é
desligado.

**Vejo menos clientes que meu colega.**
Provavelmente ele tem "ver a carteira inteira" e você vê só os clientes
atribuídos a você. É configurável.

**Mudei um contrato e o valor não bate com o CRM.**
A atualização é automática, mas leva alguns instantes. Se não bater depois disso,
reporte o problema com o número do contrato.


## Conversas financeiras

Em **Cobrança → Conversas**, selecione uma instância com a categoria **Financeiro**
para abrir seu histórico e responder pelo **OMNX Chat**. A lista respeita as
instâncias disponíveis para seu acesso; as respostas usam o mesmo fluxo do Chat.

Se a lista estiver vazia, solicite à administração uma instância financeira e a
atribuição de acesso da equipe. Falhas na consulta exibem **Tentar novamente**;
uma falha de leitura não significa que não existem conversas. Se o módulo Chat
estiver desativado, a página informa a necessidade de ativá-lo.

As réguas, os devedores e os registros de envio continuam na área de Cobrança.
Os estados disponíveis dos devedores são ativa, pausada, encerrada e pago.
