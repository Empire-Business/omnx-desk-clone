# Reorganização do Desk — publicada em 06/11/2026

Contrato autorizado: [PRD §0.8](../prd.md). Fases e pendências no
[roadmap vigente](ROADMAP-MODULARIZACAO.md). Este documento descreve somente o delta;
não substitui permissões, manuais ou registros anteriores de produção.

## Avaliação e direção

Foram divididas três frentes: navegação/marketing com `gpt-6.1-sol`, sincronização
WhatsApp/tickets e ajuda interna com `gpt-6-astra`. O Astra foi escolhido para
as duas fronteiras com maior complexidade. A disponibilidade observada é a dos
subagentes desta sessão; não foi alterada a escolha de modelo da plataforma.
Não houve medição de custos. A conferência real limitada da ajuda está registrada abaixo.

A estrutura atual tem quatro shells; não é necessário substituir o roteamento.
As entradas principais passam a evidenciar Atendimento, WhatsApp e Contratos.
Clientes continua cadastro de apoio; configuração e administração ficam separadas.
O atalho móvel `/entregas`, sem destino ativo, foi substituído por Contratos.
As URLs existentes e as regras de acesso são preservadas. As abas de atendimento
usam nomes mais descritivos e passam a se acomodar em telas pequenas.

Não existem editores dedicados de Reels/Carrossel/Stories. A oferta desses
formatos aparece nos exemplos e tipos de demanda e nos entregáveis de produtos.
Essas ofertas são retiradas de novos cadastros; contratos, registros anteriores,
relatórios e migrations históricas não serão apagados. Carrosséis de cartões de
interface e recursos de mensagens WhatsApp não são produção de marketing.

## Fluxo WhatsApp → ticket

1. Mensagem nova entra por uma conexão e conversa já autorizadas.
2. A análise identifica pedido ligado a uma mensagem real do cliente.
3. A pendência recebe identidade estável do servidor e gera um único registro
   em `atendimento_demandas`, sem reaplicar todo o histórico.
4. O ticket é acompanhado por cliente, responsável, etapa e histórico existentes.
5. A IA acompanha a conversa natural e identifica automaticamente se o problema
   daquele ticket foi resolvido, sem código ou comando obrigatório. Uma confirmação
   do cliente, como “agora consegui acessar”, pode fundamentar a conclusão quando
   o pedido correspondente estiver claro. Mensagem respondida/lida, agradecimento
   isolado, promessa futura, resolução parcial ou dúvida sobre o pedido não bastam.
   O worker confere as mensagens de origem, conversa, revisão e reabertura antes
   da baixa. O comando antigo pode continuar como compatibilidade opcional.
6. Caso resolvido por outro canal pode ser concluído manualmente no Desk.
   Essa decisão não é desfeita por uma análise antiga; reabertura é explícita.

A lista de pendências do analisador é resumida. Ausência da lista nunca significa
resolução. Baixar um alerta da Íris é uma ação diferente de concluir um ticket.
A automação deve ser idempotente e restringir vínculo, cliente, conversa e etapas
à mesma empresa. Não é prometida sincronização instantânea; ela acompanha o
processamento das conversas. Validação de concorrência e RLS em execução depende
de homologação específica, sem banco preparado automaticamente.

## Ajuda interna

O manual existente é fonte canônica compartilhada. O chatbot usa autenticação
e a integração de IA já configurada, sem ferramentas para ler ou alterar clientes.
Perguntas e respostas ficam em memória da página, com descarte na troca de sessão.
O retorno é texto, com fontes do manual e destinos internos de catálogo permitido.
O navegador filtra destinos de acordo com recursos e apps; o chatbot não concede acesso.
Falha ou ausência da função oferece consulta local ao manual, identificada como tal.
Não anunciar fallback de busca como resposta de IA. Limites por instância não são
cotas globais distribuídas de consumo.

## Plano de documentação e tutoriais

Reutilizar `/manual` e sua busca, exemplos, FAQ e glossário. Produzir vídeos curtos
somente após homologar a interface final; usar cadastros fictícios e legendas.

| Tutorial | Objetivo verificável | Formato proposto |
|---|---|---|
| Primeiro acesso | Encontrar Atendimento, WhatsApp, Contratos e Clientes | Guia de 1 página + vídeo de 2 minutos |
| Atender um pedido | Abrir a conversa, identificar cliente e acompanhar o ticket | Passos no manual + vídeo de 3 minutos |
| Concluir e reabrir | Distinguir responder, resolver, baixar alerta e reabrir | Exemplo fictício + vídeo de 2 minutos |
| Contratos | Encontrar contrato e acompanhar situação sem editar por engano | Guia de 1 página + vídeo de 3 minutos |
| Perguntar à ajuda | Usar perguntas, conferir fonte e abrir recurso permitido | Demonstração de 1 minuto |
| Reportar problema | Informar tela, passos e resultado esperado | Checklist curto no manual |

Responsável proposto: pessoa da operação valida vocabulário; responsável pelo
produto aprova capturas; manutenção acompanha cada mudança de tela. Não há
gravações produzidas nem cronograma contratado nesta entrega.

## Homologação restante após a publicação

Conferir com duas pessoas de perfis diferentes, desktop e celular: entrada e
favoritos antigos; apps desligados; edição de pedido histórico; criação repetida
da mesma pendência; dois pedidos do mesmo cliente; ausência no resumo; comando de
outro cliente/autor; concorrência entre análise e baixa manual; reabertura explícita;
ajuda sem acesso a clientes e com IA indisponível. Usar ambiente expressamente
escolhido/autorizado; não executar migrations nem enviar mensagens como rotina de teste.

Correção do dono em 06/11/2026: a resolução natural automática é o caminho normal;
a exigência anterior de código foi uma restrição indevida da implementação.
O classificador recebe catálogo fechado dos tickets abertos, não apenas as cinco
pendências resumidas, e retorna referências das mensagens e motivo curto por ticket.
Limite de contexto ou falha de consulta deve impedir baixa sem cobertura suficiente.
Confiança numérica, hash e JSON válido não comprovam por si sós o acerto semântico.

Proposta revisada por agentes não é teste real com usuários. A ausência de
regressões só poderá ser afirmada dentro das verificações executadas.

## Complemento de 06/11 — resolução natural automática

A correção retira o código obrigatório e usa a mesma análise configurada para
classificar o desfecho. O worker confere referências de mensagens e tickets,
origem, conversa, revisão e reabertura antes de aplicar a conclusão. O retorno
estruturado não tem ferramentas para alterar contratos, cadastros ou financeiro.
Pedido e solução no mesmo lote devem poder gerar e concluir a ficha na mesma
transação. Confirmação curta de cliente com ticket aberto deve chegar ao modelo,
mesmo que o filtro antigo de memória a considerasse pouco relevante.

A agenda e a reivindicação anteriores eram diárias. O delta publicado permite
reentrada por nova mensagem atestada; o cron existente está ativo a cada 15 minutos.
Limites/modelo existentes são preservados; contabilização e reserva por
empresa/dia precisam incluir as novas rodadas, sem supor custo zero em timeout.

Cenários de homologação: confirmação de acesso e arquivo; desaparecimento do erro;
promessa de teste futuro; agradecimento isolado; negação; sarcasmo; citação de
terceiro; solução parcial; dois pedidos ambíguos; baixa e reabertura manuais em
paralelo. Casos simulados verificam regras e integração, não a acurácia semântica
do modelo real. O uso real segue pendente, sem enviar mensagens para esclarecimento
ou instruções aos clientes nesta entrega.

## Evidências e estado final

A [PR #29](https://github.com/Empire-Business/omnx-desk/pull/29) foi integrada por squash à main
`cb8676c6faca8d78854ded26c14b0a2163456795`. O status GitHub do Vercel foi success
(`6RrifcrtCKZFUZckfgoC5ruMua4t`) e o domínio `desk.omnx.pro` entrega o novo index
`Dc6uMrVI`. A resposta 403 da conexão MCP direta do Vercel não impediu o fluxo
GitHub→Vercel autorizado; não é bloqueio atual do frontend.

Com Bruno administrador autenticado, os menus novos foram observados. Nova demanda
foi aberta e cancelada sem criar registro; Reels, Carrossel e Stories não aparecem
nas opções. A viewport 390×844 foi simulada com Contratos visível; a simulação foi
encerrada e a sidebar restaurada. Isso não equivale a teste em aparelho físico.

Ajuda v2 respondeu com IA à pergunta “Onde encontro os contratos de um cliente?”,
com guia, fontes e atalhos. A pergunta não continha dados de clientes. Foi uma
única pergunta de orientação; não comprova todos os cenários da ajuda, outros
perfis nem o acerto semântico do classificador de tickets.

A integração sobre main passou **186 testes em 10 arquivos**. Após a correção para
adiar excesso de metadados sem perder pedidos, passaram **78 testes pertinentes
em 2 arquivos**, incluindo um cenário novo. As rodadas não são somadas. Checagem
de tipos das 19 entradas UI, Deno e build passaram. Revisões estáticas e recibos
anteriores cobrem somente os snapshots e os controles neles registrados.
## Histórico — evidências locais antes da publicação

Preparação local da correção automática concluída. Seleção final de 129 testes
em seis arquivos passou; Deno check do entrypoint e build frontend passaram.
Typecheck focal inicialmente encontrou seis diagnósticos em dependências anteriores.
Essas causas foram corrigidas localmente e a mesma checagem focal passou; a análise
global anterior de 188 diagnósticos não foi repetida inteira. Revisão independente final encerrada, sem achado confirmado remanescente no delta,
com três controles pass e nove unknown. Recibos próprios:
`recibos/2026-11-06-resolucao-natural-{request,response}.json`.
A avaliação não é certificação nem homologação de produção.

Nova migration também prepara a cadência do job existente para cada 15 minutos
ao longo do dia, reentrada por mensagem atestada nova e reserva de uso idempotente.
Nada disso foi executado nesta sessão. A publicação deve conferir compatibilidade
entre worker, nova migration e agenda; o novo claim tem nome próprio para que um
worker antigo não reprocese o mesmo cliente várias vezes sem a reserva nova.

Cada conclusão gera recibo privado na mesma transação, preservado após reabertura;
os campos atuais da ficha podem ser limpos sem apagar a trilha. Retenção específica
segue não definida. Semântica do modelo real, SQL/RLS/concorrência e cron em execução
permanecem sem validação. Migration preparada e revisada estaticamente; execução e
validação em banco não realizadas. Produção permanece inalterada por esta entrega.

## Aprovação e preparação de publicação — 06/11/2026

O dono aprovou o plano e autorizou continuar o trabalho até o limite da conta.
A autorização identifica a proposta; ainda não identifica ambiente/operação de banco.
Pergunta específica permanece pendente. A pré-conferência remota foi somente leitura
de catálogo: as duas migrations não estão aplicadas. Não confundir essa leitura
com validação funcional, SQL em execução, RLS de usuário ou concorrência.
A publicação Vercel exige liberação explícita da equipe `alto-valor`: a conexão
retornou 403. Nenhuma autenticação/permissão foi alterada para contornar o bloqueio.
A separação sobre main atual está em preparação, sem levar o trabalho alheio da
pasta original. Detalhes em [pré-publicação](VALIDACAO-PREPUBLICACAO-DESK.md).

## Autorização expressa e execução em produção

O dono identificou `desk.omnx.pro` e autorizou as duas atualizações, publicação
e análise a cada 15 minutos. Foram aplicadas somente as duas migrations novas,
com versões remotas `20261106195505` e `20261106195522`. Webhook **v90**, analisador
**v9** e ajuda **v2** estão ativos; **15/20/5 fontes**, respectivamente, iguais aos
candidatos revisados. Catálogo confirma RLS/ACLs e triggers previstos; o cron
existente está ativo em `*/15 * * * *`. Não houve reaplicação do histórico.

Na janela de **19:55–20:04 UTC**, foram observadas **13 execuções do webhook v90** e
**1 do analisador v9**, todas com HTTP 200. Essa amostra comprova disponibilidade
na janela; não demonstra criação, resolução ou reabertura correta de pedido.

Cada conclusão deve gerar recibo privado na mesma transação, preservado após
reabertura; limpar os campos atuais da ficha não apaga a trilha. A retenção
específica segue não definida. **Permanecem pendentes** resolução/reabertura real
de pedido WhatsApp, semântica do classificador, SQL/RLS/concorrência e testes
negativos entre empresas, outros perfis e aparelhos físicos, estudo com a operação
e gravação dos tutoriais. Catálogo conferido e migration executada não equivalem
a essas validações funcionais.

Estado/evidências: [validação da publicação](VALIDACAO-PREPUBLICACAO-DESK.md) e
[recibo de release](../handoffs/2026-11-06-desk-release.json). As etapas locais e o
preflight anteriores são históricos; o estado vigente é o registrado acima.
