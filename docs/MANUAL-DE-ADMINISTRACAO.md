# Manual de administração — OMNX Desk

> Atualizado em: 27/10/2026 às 09h26 BRT — seção Automações WhatsApp (Íris, Vínculos, WhatsApp da equipe).
> Para quem administra uma conta (empresa) no Desk: cria pessoas, liga apps,
> define quem vê o quê. Operação do dia a dia está no
> [Manual do usuário](MANUAL-DO-USUARIO.md).

---

## Os quatro controles que você tem

Eles são independentes e se combinam em **E**. Uma tela só aparece quando os
quatro deixam passar — é por isso que "dei permissão e continua sumido"
normalmente é o app desligado, não a permissão.

| Controle | Onde | Pergunta que responde |
|---|---|---|
| **Apps ligados** | `/apps` | Esta empresa usa este app? |
| **Permissões** | `/admin` | Este perfil pode agir neste recurso? |
| **Perfil da pessoa** | `/colaboradores` | Que papel ela exerce? |
| **Empresa (tenant)** | automático | De qual empresa é este dado? |

O quarto não tem tela porque não se configura: cada dado nasce carimbado com a
empresa e o banco impede que uma empresa leia dados de outra.

---

## Pessoas

### Criar

Em `Colaboradores → Novo`, cadastre a pessoa. O Desk gera uma credencial
individual aleatória e prepara o link de definição de senha; não há senha
compartilhada para novos colaboradores.

Quando houver exigência de troca de uma senha inicial antiga, a pessoa define
uma nova no próximo login, antes de continuar no Desk. A marcação não encerra
sessões já abertas, e renovar o token da mesma sessão não conta como novo login.
Ao salvar a senha, o Supabase mantém a sessão usada na troca e encerra as outras
sessões dessa pessoa. Recuperação: use **Esqueci minha senha** no login.

### Perfis

| Perfil | Uso típico |
|---|---|
| `admin` | Dono da conta. Passa por qualquer permissão, sempre |
| `gerente` | Gestão: vê a carteira inteira, atribui responsável |
| `estrategista` | Atende os clientes atribuídos a si |
| `atendimento` | Fila de atendimento; vê os clientes, não todas as conversas |
| `cliente` | Acesso externo (Portal) |

O `admin` passa por tudo por desenho: é o fail-safe que impede uma configuração
errada de trancar o dono para fora da própria conta.

---

## Apps (`/apps`)

Ligue e desligue o que a empresa usa. Desligar:

- tira o app do menu;
- bloqueia a rota (não abre nem digitando a URL);
- **não apaga nada** — religar devolve tudo como estava.

Fica registrado quem ligou ou desligou e quando.

---

## Permissões (`/admin`)

A matriz é **perfil × recurso × ação**. As ações são uma escada:
`admin` ⊃ `editar` ⊃ `ver` — quem pode editar, pode ver.

Recursos que valem explicação, porque não são "abre a tela?":

| Recurso | O que decide de verdade |
|---|---|
| `clientes.carteira` | Ver **todos** os clientes ou só os atribuídos à pessoa |
| `chat.carteira` | Ver **todas** as conversas ou só as dos seus clientes |
| `clientes.atribuir` | Poder definir quem é o estrategista/atendente de um cliente |
| `contratos.onboarding` | Só a aba de vendas novas, sem o resto de Contratos |

> Antes de 06/08/2026 essas quatro regras estavam fixas no código como
> "admin ou gerente". Passaram para a matriz sem que ninguém ganhasse ou perdesse
> acesso — o seed reproduziu exatamente quem já tinha. Agora dá para delegar sem
> promover a pessoa a administrador.

A tela `/admin` continua exclusiva de `admin`, de propósito: é a tela que edita a
própria matriz. Delegá-la permitiria a alguém se auto-promover.

---

## Ramo da empresa

`Configurações → Ramo da empresa`. Define o vocabulário, as abas e os indicadores
do Atendimento (Social Media, Clínica, Escritório).

Trocar o ramo é **aditivo**: as etapas e os tipos do ramo novo entram junto dos
que já existem. Nada do que foi registrado se perde.

---

## Automações WhatsApp (`/automacoes-wa`)

Mensagens automáticas no WhatsApp e uma assistente de IA para a equipe:

| Mensagem | Quem recebe | O que diz |
|---|---|---|
| **Aviso diário** | Cada **gestor** no privado, ou o **grupo interno** da equipe | Clientes que pedem atenção hoje (separados por estrategista, se você ligar) + grupos sem cliente + reuniões do dia |
| **Resumo semanal** | O **cliente**, no grupo dele ou na conversa privada com ele | Assuntos tratados e próximos passos da semana, escrito para o cliente |
| **Link da reunião** | O **grupo do cliente** | Data, hora e link da reunião marcada |
| **Respostas da Íris** | Só o **grupo interno** liberado | Respostas às perguntas da equipe sobre clientes, contratos, comissões e atendimento |

Pense num assistente que acorda a cada 15 minutos, olha o relógio e, se estiver
na hora que você marcou, manda a mensagem.

**Tudo começa desligado.** Nada é enviado até você ligar. O aviso cita o nome do
cliente e nunca copia trechos de conversa.

### Quem pode

Só quem tem `automacoes-wa · admin` abre a tela (o perfil `admin` já tem). Salvar
o token/chave e usar o botão de teste exigem o **perfil** `admin` — delegar pela
matriz não basta. Para alguém só **agendar** reuniões, dê `automacoes-wa · editar`.

A aba **Vínculos** e a seção **"WhatsApp pessoal da equipe"** são mais
fechadas: só **admin ou gerente** que também tenha `automacoes-wa · admin`. Um
gerente sem a permissão do app não vê nada disso.

### As abas

| Aba | Para quê |
|---|---|
| **Início** | "Primeiros passos" (o que falta) e um cartão por automação: ligada ou não, próximo e último envio |
| **Conexão** | Por onde as mensagens saem (UAZAPI ou WhatsApp Oficial/Zernio), token, modelos aprovados e "Enviar teste" |
| **Relatório diário** | Quem recebe, horário, quais alertas entram, "Separar por estrategista", "Só clientes ativos" e "Ver como fica" (prévia sem enviar) |
| **Pontos de atenção** | O que entraria no aviso se ele saísse agora; marque "Resolvido", silencie ou "Vincular a um cliente" |
| **Assistente** | A Íris: ligar, nome, onde responde, proteger números, grupos, WhatsApp pessoal da equipe, o que ela aprendeu, simular pergunta |
| **Resumo semanal** | Dia, horário e canal do cliente (grupo ou privado) |
| **Reuniões** | Agendamento em duas etapas: marcar e depois mandar o link |
| **Histórico** | Cada envio: enviado, falhou (com motivo) ou simulado. Apagado depois de 90 dias |
| **Vínculos** | De qual cliente é cada grupo e cada conversa privada (só admin/gerente) |

### Passo a passo

1. **Conexão** — escolha por onde as mensagens saem:
   - **Não oficial (UAZAPI)**: escolha um número já conectado no Chat e salve o
     token da instância. É o único caminho que envia em **grupos**.
   - **Oficial (Zernio)**: cole a chave da API e o código da conta (`account_id`)
     da Zernio, e os nomes dos **modelos aprovados** e o idioma (`pt_BR`). Fora de
     uma conversa recente, a API oficial só envia modelo aprovado pela Meta.
   - Clique em **Enviar teste** para o seu celular. Chegou? A conexão está boa.
     Limite: 5 testes por hora.

   > O token/chave vai direto para um cofre (Vault). Depois de salvo, ninguém
   > consegue vê-lo de novo pela tela — para trocar, cole um novo.
2. **Relatório diário** — cadastre quem recebe (até 10 pessoas, ou um grupo
   interno só com gente da equipe), ligue, escolha o horário (Brasília) e os
   alertas:

   | Alerta | Avisa quando |
   |---|---|
   | Cliente sem resposta | O cliente escreveu e ninguém respondeu (horas ajustáveis, padrão 4) |
   | Clientes insatisfeitos | A IA leu as conversas do cliente de manhã e viu insatisfação demonstrada **pelo cliente** |
   | Clientes em risco | Regra, sem IA: cliente em silêncio há 21 dias ou mais, pedido em aberto há mais de 5 dias úteis, ou queda forte de conversas |
   | Contrato ou reunião parados | Contrato inadimplente/pausado, "Não iniciado" há mais de 7 dias, reunião que passou e continua "marcada" |
   | Queda no volume de conversas | O cliente mandou bem menos mensagens que a média (% ajustável, padrão 50) |
   | Grupos ativos sem cliente vinculado | Grupo com conversa recente que ninguém disse de qual cliente é. Sempre aparece, com o link da aba Vínculos |

   "Clientes insatisfeitos" e "Clientes em risco" são **um alerta só** na tela
   (insatisfeito ou em risco), que sai em duas partes na mensagem.

   Opções: **Separar por estrategista** (cada estrategista vê os clientes dele
   juntos; quem não tem responsável cai em "Sem estrategista") e **Só clientes
   ativos** (contato sem cadastro vira só uma linha de contagem no fim). Na
   empresa principal, o aviso sai às 08:00 no grupo interno da equipe, com as duas
   opções ligadas (pedido do Sandro). Use **Ver como fica** para conferir antes.

   Para mandar um diário extra, administradores podem usar **Enviar um relatório
   agora**: escolher um grupo interno ativo, preparar a prévia e clicar em
   **Enviar agora**. O envio usa os dados e as preferências atuais da Íris, sem
   mudar o horário do diário. Se a conexão cair, use **Conferir resultado do
   pedido**: o mesmo pedido não envia duas vezes. Prepare outro envio somente
   depois de conferir o resultado no histórico.
3. **Pontos de atenção** — a lista do dia. Para cada item: **Resolvido**,
   **Silenciar** (7 dias, 30 dias ou até o cliente escrever) ou **Não alertar
   mais**. Em "Grupo sem cliente", o botão **Vincular a um cliente** abre a aba
   Vínculos já no grupo certo.
4. **Vínculos** (admin/gerente) — veja a seção abaixo.
5. **Assistente (Íris)** — veja a seção abaixo.
6. **Resumo semanal (vai para o cliente)** — ligue, escolha dia, horário e o
   canal: **grupo do cliente** (só pela UAZAPI) ou **privado do cliente**. A IA
   resume só as mensagens daquela conversa, para o cliente: nunca entra risco,
   clima ou avaliação da equipe. O cliente lê o que sai, sem revisão antes:
   comece com um cliente de teste e acompanhe pelo Histórico.
7. **Reuniões** — ligue para permitir o agendamento em duas etapas: a reunião
   é marcada na agenda **sem link**; depois o link vai no grupo do cliente,
   **uma única vez**, sempre pela UAZAPI.

### Vínculos: de qual cliente é cada conversa

A análise de satisfação, o relatório e a Íris só enxergam conversas **ligadas a
um cliente**. A maior parte dos grupos de clientes não estava ligada — por isso a
análise antiga não via nenhum cliente com contrato vigente. Pense na aba
Vínculos como a **etiqueta na pasta**: sem etiqueta, ninguém sabe de quem é.

1. Abra **Automações WhatsApp → Vínculos**. Comece pelo filtro **"Falta
   decidir"** (conversas ativas em 30 dias ainda sem dono).
2. Para cada conversa, o sistema mostra o nome, quantas mensagens teve, em
   quantos números aparece e, quando acha, uma **sugestão** ("parece ser de …").
   Use **Abrir conversa** se precisar olhar.
3. Decida:
   - **Aceitar** — a sugestão está certa;
   - **Outro cliente** / **Escolher cliente** — procure pelo nome (dá para ligar
     um grupo a dois clientes);
   - **Grupo interno** (ou "É da equipe", no privado) — conversa só da equipe;
   - **Não é cliente** — fornecedor, lead, parceiro.
   Errou? **Desfazer** / **Trocar cliente**.
4. O vínculo vale para o **grupo em todos os números** da empresa (não só no
   número em que você clicou) e aparece também no Chat.
5. As sugestões são recalculadas sozinhas **todo dia às 6h30**. O botão
   **Recalcular sugestões** força agora (no máximo 1 vez por minuto).

Regras de segurança: o sistema só liga sozinho quando é certo (o grupo já estava
ligado em outro número, ou o telefone é de um único cliente). **Nome parecido
nunca liga sozinho** — vira sugestão para você confirmar. Grupo interno nunca
entra na análise de clientes.

> Se aparecer "Algum número está com 'Ocultar grupos' ligado": esses grupos não
> aparecem na lista do Chat da equipe, mas aparecem aqui para você decidir.

### Íris: a assistente da equipe no WhatsApp

A Íris (antes "Anah"; o nome muda na aba Assistente) é uma **colega de plantão
no grupo da equipe**: alguém pergunta "Íris, como está o cliente X?" e ela
consulta o sistema e responde ali. Ela só **lê** — não muda nada nos clientes.

**Onde ela responde.** Só no grupo interno **"Report Entregas"**. **Nunca no
privado**: o número que ela usa também conversa com clientes. Deixe sempre
desligado "Responder no privado" e **não use "Mandar boas-vindas" para pessoas**
(isso vai no privado).

**Como chamar no grupo.** Marque **@Íris** (digite @ e escolha o contato),
**responda a uma mensagem dela**, ou comece a frase com **"Íris, …"**. Ela
também responde a "ajuda" ou "o que você faz?".

**O que ela sabe.** Clientes, situação e histórico de conversa do cliente (todos
os grupos e privados, de todos os números), alertas, satisfação e risco,
contratos e recebíveis, comissões, vendas pendentes, demandas, reuniões, equipe
e desempenho do atendimento. Valores e conversas só aparecem para quem teria
permissão de vê-los no sistema.

**"Todos no grupo veem tudo".** Ligado no Report Entregas: qualquer pessoa do
grupo pergunta sobre qualquer cliente da empresa. Só ligue em grupo que tenha
**só gente da equipe**.

**Configurar (aba Assistente):**
1. **Ligar o assistente** e conferir o nome.
2. **Proteger conexão**: clique em proteger em **cada número** da lista. Isso
   coloca uma chave secreta no endereço que recebe as mensagens. Sem ela, a Íris
   não responde por aquele número (alguém poderia se passar por um membro da
   equipe). "Trocar chave" gera outra; a antiga vale mais 10 minutos.
3. **Grupos**: libere o grupo interno, escolha o número principal e, se quiser,
   números reserva (que também estejam no grupo e protegidos).
4. **WhatsApp pessoal da equipe**: escolha a pessoa, digite o celular dela e
   **Adicionar**. Serve para o sistema saber que é **a equipe** falando nos
   grupos dos clientes (quem escreve do celular pessoal aparecia como se fosse o
   cliente). Com o número cadastrado, a resposta da equipe apaga o "aguardando
   resposta" e a análise de satisfação deixa de achar que o cliente falou
   sozinho. Só os 4 últimos dígitos aparecem na tela. Os números da empresa já
   são reconhecidos sozinhos.
5. **Simular pergunta**: escolha uma pessoa e pergunte; a resposta aparece na
   tela, **sem enviar**, com as ferramentas usadas e o custo.
6. **Últimas respostas**: resultado, ferramentas e custo de cada resposta (o
   texto das perguntas e respostas não fica guardado).

**O que a Íris aprendeu.** Dá para ensinar pelo próprio WhatsApp: "Íris, responda
mais curto", "chame os clientes pelo primeiro nome". Ela guarda a preferência
(até 50) e passa a seguir. Na aba Assistente, a seção **"O que a Íris aprendeu"**
mostra cada preferência, quem ensinou e quando; você pode desligar, apagar ou
**Ensinar uma preferência** pela tela. Ela recusa pedidos que mexam em
segurança, permissões, destinos ou dados sensíveis. Pelo grupo também dá para
ajustar o aviso diário (horário, separar por estrategista, só clientes ativos,
tipos de alerta).

> ⚠️ **Risco aceito pelo dono (27/10/2026):** no grupo com "Todos no grupo veem
> tudo", **qualquer pessoa do grupo** pode ensinar preferências e ajustar o aviso
> diário, sem cadastro. Confira a lista "O que a Íris aprendeu" de vez em quando.

### Transcrição de áudios

Áudios recebidos (e imagens sem legenda) são transcritos/descritos
automaticamente em poucos minutos, para a análise e a Íris entenderem. No Chat,
o áudio ganha o botão **"Ver transcrição"** (transcrição automática, pode conter
erros). Áudio de grupo interno nunca é transcrito.

### Desligar

- Uma automação: o interruptor dela na aba correspondente. A Íris: "Ligar o
  assistente" desligado tem efeito imediato.
- Tudo da empresa de uma vez: desligar o app em `/apps`. Nada é apagado.

---

## Reportes de erro (`/reportes`)

Cada problema reportado chega com print da tela, rota, navegador e o rastro
técnico do momento. Você tria: status, prioridade, nota interna (privada) e
resposta ao usuário (que ele vê em "Meus reportes").

Desde 06/08/2026, todo reporte de **categoria bug** dispara e-mail para os
administradores da empresa. Dúvida e sugestão não disparam — canal de alerta que
avisa demais deixa de ser lido.

---

## Saúde do sistema (`/saude`)

Erros registrados por app nas últimas 24h, 7 ou 30 dias, mais os últimos erros
com tela e mensagem.

É complementar aos reportes: o reporte é o que a **pessoa viu**; a saúde é o que
o **sistema sentiu**, inclusive quando ninguém reclamou. Erro que ninguém reporta
(porque a pessoa desistiu e fechou a tela) aparece aqui.

---

## O que NUNCA fazer

- **Colocar a `service_role_key` no `.env`, no código ou em qualquer arquivo
  versionado.** Ela ignora toda a segurança do banco. Se aparecer em algum lugar,
  pare tudo e remova.
- **Rodar SQL direto no painel do Supabase.** Toda mudança de banco vai por
  migration versionada — senão o próximo deploy desfaz, ou o histórico
  dessincroniza e nenhuma migration nova sobe.
- **Commitar `.env`.** Está no `.gitignore`; mantenha assim.
