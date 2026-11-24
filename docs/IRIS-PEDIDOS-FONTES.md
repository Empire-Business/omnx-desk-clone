# Pedidos, autoria e histórico da Íris

## Conversas do mesmo grupo

O Chat agrupa visualmente pelo tenant e JID canônico depois de autorizar e filtrar as conversas. Nome não identifica grupo. Não há exclusão de linhas ou transferência de histórico entre empresas. O histórico das origens autorizadas é paginado e mantém conversation_id, horário e identificação da instância. Envio e ações usam a instância selecionada; responder/reagir/editar uma mensagem de outra origem exige selecioná-la.

## Autoria e atendimento temporário

Identidades ativas da equipe contam como atendimento mesmo quando a pessoa não é a estrategista principal. Carteira e atendente da conversa são apresentados separadamente. Nomes parecidos não fornecem prova de identidade. O webhook protegido ou a recuperação autenticada do provedor validam telefone/LID contra o cadastro; não enfraquecer essa fronteira para corrigir dados antigos.

Confirmações exatas (emoji de aprovação ou agradecimento) só são retiradas dos candidatos sem resposta quando há uma resposta de equipe comprovada no mesmo grupo em até 24 horas e nenhum pedido intermediário. Texto adicional, dúvida ou contexto insuficiente mantêm o alerta. A coleta considera origens do mesmo grupo/tenant.

Uma resposta comprovada de equipe posterior ao candidato também pode encerrar a espera de outra origem do mesmo grupo. A busca é limitada à janela ativa; empate de horário com cliente/desconhecido ou corte de contexto mantém o aviso. Essa regra não conclui entregas ou pedidos por suposição.

## Fonte de cada pedido

O modelo referencia uma mensagem por ID opaco. A validação confere o ID na timeline do próprio cliente e usa a data real da fonte em Brasília. O painel recebe autor, data/hora, trecho seguro, descrição e retorno esperado. Memórias antigas sem origem não ganham autor/data inventados; são explicitamente identificadas como não confirmadas.

Fontes novas exigem autoria `cliente`; equipe, sistema, IA e desconhecido não comprovam quem fez o pedido. Para IDs persistidos que saíram da amostra de 400 mensagens/90 dias, o coletor consulta a timeline canônica do mesmo cliente e tenant em janela estreita do dia registrado. Confere ID exato, autoria e data, com cache, limite de 1.000 linhas e no máximo quatro clientes simultâneos. Ausência, erro ou corte cheio mantêm a indicação de fonte não confirmada. Esses metadados não ampliam amostra, métricas nem atualidade do alerta.

Responsabilidade é interna, cliente, terceiro ou indeterminada. Uma revisão administrativa persistida só vale para a mesma mensagem e tema normalizado. A saída do modelo não pode criar essa revisão. Estado escrito por serviço/operador mantém ator, horário e motivo. Revisar um pedido não resolve o pedido nem silencia os demais alertas do cliente. Sem revisão, a responsabilidade fica a confirmar. Não existe, neste delta, botão de edição dessa revisão no painel ou ferramenta nova no WhatsApp.

As quatro contagens técnicas de conversas antigas/cadastro/casos históricos/reanálises deixam de aparecer nos avisos; os dados administrativos continuam disponíveis. O template oficial conserva seus limites e variáveis aprovadas. Saída que excede o orçamento de pendências é rejeitada, preservando o estado anterior.

A versão `relacionamento-v3-fontes` permite uma revalidação única de memória antiga com pendência sem fonte, mesmo sem novas mensagens, quando há mensagem de cliente na janela normal de análise. Mantém cursor e limites de IA; análise inválida ou falha preserva memória e versão anterior. Histórico também registra mudanças de fonte, retorno esperado e revisão de responsabilidade.

## Queda de volume

A migration `20261106160448_wa_queda_volume_autoria_grupos.sql` substitui a consulta antiga por uma leitura de mensagens com `autor_tipo=cliente`, por JID canônico do mesmo tenant, deduplicadas por canal e ID do WhatsApp. Privados continuam por contato. Representante estável prioriza contato vinculado, inclusive quando a mensagem chegou por outra origem. Mantém fórmula, janelas de 7/35 dias e execução exclusiva por serviço.

Instalada em produção em 06/11/2026, com assinatura, grants e leitura do resultado conferidos. Após reconciliar autoria histórica comprovada, Cohen deixou de aparecer no alerta de queda de volume na consulta e no painel. Na primeira etapa, o vínculo do grupo de Rodrigo foi aceito na sessão real do administrador e sincronizado nas duas origens; naquele momento, os dois grupos eram conversas distintas vinculadas ao mesmo cadastro.

Ainda em 06/11/2026, a confirmação de que Rodrigo e Flávia têm atendimentos separados no mesmo contrato levou à correção desse cadastro: Flávia foi criada pela interface como cliente separado e associada ao contrato existente, com Rodrigo mantido como principal. Cada grupo passou a apontar para seu próprio cliente nas duas origens, pelo identificador canônico. A comparação do contrato confirmou a preservação dos dados financeiros; Octavio foi mantido. As duas memórias foram reconstruídas e conferidas: Rodrigo com 57 mensagens, Flávia com 61, um grupo por cliente e nenhuma mensagem compartilhada entre as timelines. A execução teve duas análises sem falha, sem pendências identificadas e sem reivindicações restantes. O histórico anterior permanece como evidência da configuração combinada, sem representar o vínculo atual. Procedimento e limites em `CONTRATOS-VIGENCIA.md`.

## Recuperação operacional

`uazapi-recuperar-mensagens` mantém autenticação por `x-cron-secret` validado no Vault. O modo geral usa janela operacional de sete dias. Grupo direcionado aceita até 366 dias e precisa existir no tenant e instância informados, com JID exato numérico ou completo.

`solicitar_historico:true` e `reconciliar_autoria:true` exigem alvo e `dry_run:false`. Uma solicitação de histórico é enviada por chamada; ausência de avanço ou bloqueio não dispara repetição automática. `completed` com `has_more:false`, sem corte de período/paginação, indica o fim dos registros disponibilizados pelo provedor. Isso não prova retenção integral ou disponibilidade dos arquivos. Registrar o resultado efetivo e a cobertura.

Autoria de mensagens existentes só muda após leitura autenticada do provedor e correspondência de tenant, instância, grupo e ID. Conteúdo, mídia e horário não são reescritos; plataforma/IA são preservadas. CAS impede sobrescrever campos de autoria ou estado de espera alterados durante o processamento. Mensagens novas passam pelo webhook em modo silencioso, preservando o horário original e sem push, Íris, bot ou CSAT. O recibo exige persistência conferida; erro ou retorno precoce não vira HTTP 200 de recuperação. Reações no webhook são restritas à origem autenticada e à mensagem do mesmo grupo/empresa. Na recuperação em lote, eventos históricos de reação são contabilizados separadamente e não restaurados nem reenfileirados como mensagens novas.

Uma execução operacional encontrou `RateLimitError` após vários replays. A rotina interrompe no primeiro limite, sem retry automático, e `restantes` inclui mensagens que falharam ou não foram tentadas. Lotes operacionais de dez mensagens avançaram com persistência confirmada; usar esse tamanho ao completar um histórico volumoso, conferindo o recibo de cada operação.

## Verificação desta entrega

272 testes focados, checagem de tipos, build e Deno dos 11 consumidores passaram. Treze casos runtime com mocks cobriram os handlers reais de webhook/recuperação, incluindo concorrência entre leitura/escrita, JID completo, duplicatas, erro de persistência, reação de outra empresa, fila de reações e interrupção por limite. Os testes com mocks não exercem RLS nem concorrência reais; nenhuma identidade/JWT artificial, banco de teste ou fixture de produção foi criado. O pacote preserva a prova de ingresso de tempo de resposta já instalada na versão 88 do webhook.

No delta final, 122 testes dos quatro arquivos diretamente alterados e Deno dos oito consumidores passaram; a consulta de volume tem cinco verificações estáticas adicionais. Readback das onze funções publicadas confirmou todos os arquivos runtime e flags de JWT. A interface de produção foi conferida com a sessão real do usuário, sem envio de mensagens ou alteração contratual de teste.

A conferência retroativa autorizada reanalisou 16 memórias antigas e depois Cohen com os dois grupos confirmados, sem falhas ou cursores regressivos nos 16. Três fontes ausentes foram comprovadas na timeline canônica e acrescentadas por reparo administrativo com CAS integral, `xmin` e histórico, preservando status, risco, satisfação, cursor e custos. Duas fontes de agosto receberam revisão de responsabilidade indeterminada para conservar a referência antiga, sem atribuir a entrega a alguém. Os arquivos com IDs, mensagens e SQL operacional ficam fora do Git.

A última correção de busca/guarda de fontes passou em 91 testes focados de três arquivos e Deno dos oito consumidores; essas rodadas se sobrepõem às anteriores. Nenhum teste de banco, identidade sintética ou fixture de produção foi criado.
