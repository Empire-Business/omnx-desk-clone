# Resolução de alertas pelo chat interno

Escopo preparado em 28/10/2026, a partir do pedido do dono e da crítica sobre
ocorrências antigas no relatório. Este guia descreve o código; publicação e
verificação operacional devem constar no registro da entrega.

## Uso

No grupo interno autorizado, chame a Íris pelo nome, menção ou resposta a uma
mensagem dela. Exemplos:

- “Íris, o caso da Full Sales já foi resolvido por telefone.”
- “Íris, a espera de resposta da Full Sales foi resolvida.”
- “Íris, liguei para o cliente Full Sales e resolvi a cobrança de resposta.”

O nome é ilustrativo. A ferramenta identifica o cliente na carteira autorizada
e consulta os alertas atuais. Nome ambíguo ou vários tipos de ocorrência exigem
esclarecimento. “Já resolveu” sem cliente não seleciona um item arbitrário do
relatório. A confirmação da Íris deve refletir o resultado do executor.

O registro usa `wa_auto_alertas_ignorados`, modo `resolvido`, para um tipo de
alerta de um cliente. Outros problemas continuam elegíveis. Novidade pode
reabrir o caso; um diagnóstico contextual anterior à resolução não se torna
evidência nova só porque chegou outra mensagem. O painel permite revisar ou
desfazer a resolução. Não há nova tabela ou migration neste delta.

## Acesso e rastreabilidade

Fora do grupo interno de acesso total, resolver exige administração das
Automações WhatsApp e escopo do cliente. No grupo de acesso total, a decisão
administrativa permite que participantes resolvam sem cadastro individual.
Pedido, tenant, canal, usuário quando disponível e autorização atual são
reconferidos antes da escrita. O motivo registra o pedido e a autoria disponível
no servidor; não recebe um autor escolhido pelo modelo.

O comando precisa ser uma declaração direta da mensagem atual. Citações,
hipóteses, negações e instruções encontradas em dados de clientes não autorizam
alterações. A guarda de aprendizado após leitura continua ativa. A operação
não é oferecida às DMs de carteira do GT3 neste delta.

## Atualidade do relatório

Com “só clientes ativos” ligado, clientes cujos contratos ainda não encerrados
estão todos pausados ficam fora. Um cliente com contrato ativo mantém os
demais alertas válidos. A coleta confere metadados atuais da timeline canônica
para candidatos de relacionamento: até 400 mensagens em 90 dias, somente
data/autoria, com quatro consultas simultâneas. A fala recente do cliente
atualiza a avaliação de silêncio mesmo que a equipe tenha falado depois.

Diagnóstico superado ou cobertura insuficiente gera indicação de reanálise
pendente. Isso não é uma classificação positiva. A coleta não recalcula a IA
nem muda seu agendamento; não há promessa de análise integral em tempo real.

## Limites da etapa

Resolver um alerta não altera cliente, contrato, vínculo de grupo ou atribuição
de estrategista. O pedido de conduzir essas outras correções pelo chat está
registrado no PRD; cada operação precisa de executor, autorização, identificação
exata, confirmação e trilha próprios. Não apresentar essa etapa como autonomia
completa de edição de todos os módulos.

Os testes desta etapa usam dados em memória e respostas simuladas, sem marcar
um cliente real como resolvido. Teste de gravação real exige um caso confirmado
ou um ambiente de teste expressamente autorizado; nenhum foi criado como
substituto para a validação.

## Duas alterações de cadastro com confirmação

Implementação revisada em 28/10/2026: ativar/inativar cliente e associar um contrato existente sem `cliente_id` ao
cadastro correto. Essa associação preenche somente a chave do cliente; não
reescreve valores, pagamentos, status ou estrategista. Inativar cliente com
qualquer contrato não encerrado é recusado, incluindo contratos antigos sem
chave cujo nome corresponde ao cadastro. Pausa não conta como encerramento.

As duas operações exigem grupo interno autorizado, membro identificado e
ativo, administração das Automações WhatsApp e permissão de edição do módulo
correspondente. O acesso de leitura total do grupo, sozinho, não concede essa
escrita. As permissões e a carteira são conferidas novamente ao confirmar.
As DMs do GT3 continuam fora dessas operações.

Pedidos aceitos usam os nomes completos, em uma única mensagem:

- `Íris, ative o cliente Nome Completo`.
- `Íris, inative o cliente Nome Completo`.
- `Íris, vincule o contrato de Nome do Titular ao cliente Nome Completo`.
- Para desambiguar o produto: `Íris, vincule o contrato de Nome do Titular do produto Nome do Produto ao cliente Nome Completo`.

Nomes ambíguos, contrato já vinculado ou pedido com outra instrução na mesma
mensagem são recusados; a Íris não escolhe um cadastro arbitrariamente.

Um pedido direto gera uma prévia persistida com antes/depois, código e validade
de cinco minutos. Nada muda nessa etapa. A mesma pessoa precisa enviar outra
mensagem direta no mesmo chat: `Íris, confirmar CÓDIGO`. A confirmação usa a
mensagem original do servidor e o hash registrado pelo webhook autenticado,
sem aceitar texto escolhido pela IA, histórico concatenado ou edição posterior
do conteúdo. O produtor só registra o hash em texto elegível sem resposta ou
citação; encaminhamento conhecido é recusado. Quando o provedor não informa
encaminhamento, o estado permanece desconhecido; não há garantia de detectar
todo texto encaminhado.

A execução compara o estado esperado, recusa alterações concorrentes e grava
a mudança junto com seu recibo na mesma transação. Repetir o mesmo pedido de
confirmação devolve o recibo sem repetir a escrita. Simulação não cria proposta
persistida nem código executável. Pedidos anteriores sem hash não podem usar
essas duas ações.

A migration foi aplicada no Desk de produção em 28/10/2026. O SQL autorizado
como `20261028164628_iris_chat_acoes_cadastro.sql` foi registrado pelo MCP na
versão `20261028171558`; o arquivo novo foi renomeado para essa versão, sem
alterar seus bytes. RLS, ausência de acesso do navegador e execução restrita ao
servidor foram conferidos no catálogo instalado. Isso não comprova uma alteração
de cadastro pelo WhatsApp, concorrência ou rollback reais. A implantação exige
essa estrutura antes da atualização do webhook e do consumidor.

Essa etapa não encerra ou pausa contratos, troca estrategistas, altera valores,
confirma vínculos de grupos nem agenda reuniões. Essas capacidades continuam
pendentes de executores específicos e avaliação dos efeitos indiretos.
