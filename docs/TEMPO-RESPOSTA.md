# Tempo de resposta dos estrategistas

Backend publicado em produção em 03/11/2026, com o monitor desligado. Esta versão entrega o painel administrativo, a configuração independente no GT3 e o capítulo do manual público. A publicação da interface não ativa a medição nem os envios. Nenhum alerta real foi enviado nesta etapa.

Expediente aprovado: America/Sao_Paulo, segunda a sexta, 09–12 e 13–18, exceto feriados cadastrados. Meta de 60 minutos úteis; alertas aos 30, aos 50 e após 60 minutos. Uma sequência de cobranças não reinicia a espera. IA, reações e mensagens de sistema não encerram atendimento humano.

O Desk mantém a espera por conversa, responsável e histórico. Resposta de outra pessoa é cobertura, sem crédito ao titular. Sem vínculo inequívoco, remetente confiável ou relógio coerente, a medição fica inconclusiva. Não reconstruir desempenho individual antigo com suposições.

Modo inicial desligado; observação mede sem enviar; alertas depende também de ativação no workspace GT3. Calendário anual precisa ser conferido por administrador; não há preenchimento automático de feriados. A extensão de agenda pessoal e seus limites de validação estão descritos ao final deste documento.

Pausa de reunião tem início do servidor, término obrigatório em até 4h e motivo; não apaga a espera do cliente. Titular opcional só pode ser um estrategista atualmente vinculado. Quando há somente um, ele é o titular; quando há vários e nenhum escolhido, não há cobrança individual.

Leitura do painel restrita a administradores do módulo. GT3 confere conexão, destinatário, carteira e instância; conteúdo limitado ao cliente autorizado. Deduplicação por episódio, segmento do responsável, destinatário e faixa. Rechecagem antes de entrega e recibo depois do commit; não há transação distribuída entre projetos.

Salvar calendário ou alternar entre observação e alertas preserva a identidade dos avisos. A revisão gravada no aviso documenta sua origem; a ponte confere a configuração atual. Pausa, observação e fim do expediente entre a seleção e a confirmação são impedimentos retentáveis. Desligar encerra os episódios; resposta, troca e faixa ultrapassada tornam o aviso anterior obsoleto. O mecanismo do GT3 admite até três tentativas por entrega; falhas persistentes ficam no monitor e não têm promessa de entrega garantida.

## Como usar

1. No Desk, abra **Automações WhatsApp → Tempo de resposta → Começar acompanhamento** (ou **Configurações**, se já iniciado).
2. Cadastre os feriados nacionais e locais aplicáveis e confirme o ano. A confirmação não preenche datas automaticamente. As alterações valem para novas esperas; registros existentes preservam seu calendário de origem.
3. Selecione **Observar**. Confira a identificação da equipe, os vínculos dos clientes e as medições pendentes.
4. Se necessário, escolha o titular entre os estrategistas vinculados ao cliente. Para alterar a carteira, use **Clientes → ficha → Responsáveis pelo cliente**. O histórico guarda a troca e o relógio do cliente continua.
5. A equipe responde normalmente, sem registrar pausas. O backend da conexão pessoal do Google Agenda foi publicado; o desconto automático ainda aguarda homologação com conta real, conforme a seção abaixo. A espera do cliente não deve ser usada sozinha como avaliação individual. Pausas antigas ainda ativas permanecem visíveis e podem ser encerradas.
6. Quando a medição estiver conferida, selecione **Observar e avisar**. Ative também **Tempo de resposta dos clientes** em **GT3 → Configurações → Integrações → Íris**, no workspace desejado.
7. Confira os envios em **Últimas entregas → Ver mensagem**. Uma linha preparada ou cancelada no Desk não comprova entrega no GT3.

O painel mostra até 100 registros por página, com filtros e resultados limitados à página consultada. O filtro de pessoa inclui casos em que ela participou; a métrica individual da linha refere-se ao responsável atual. A tabela de casos encerrados distingue respostas próprias e coberturas. O percentual dentro de uma hora mede a espera do cliente, sem ser apresentado como desempenho pessoal.

Exemplo: mensagem às 11h40 e resposta às 13h20 representam 40 minutos úteis. Uma pausa registrada reduz o tempo individual, mas mantém a espera do cliente visível.

## Verificação local e limites

- Desk: 81 testes focados de cálculo, ponte/API e contrato SQL; 27 testes de frontend. Todos passaram.
- GT3: 95 testes únicos, incluindo regressões da integração, entrega e controle de ativação. Todos passaram.
- Deno passou para os cinco endpoints envolvidos no Desk e os dois no GT3. Tipagem focal dos componentes passou nos dois projetos. O build do Desk passou; o aviso de bundle grande permanece.
- Em 04/11, builds dos dois frontends passaram. Na base atual, 26 testes de UI Desk passaram (1 gerador de prévia opcional ignorado) e 17 testes focados GT3 passaram. A tipagem global terminou com 188 diagnósticos no Desk e 53 no GT3, exatamente iguais às respectivas mains; nenhum diagnóstico novo. Isso não equivale a tipagem global aprovada.
- O novo manual foi conferido no navegador, servido pela aplicação real em desenvolvimento. O painel exige login; a homologação autenticada e o ciclo real de medição/envio permanecem pendentes. Os testes do componente e do hook cobrem estados, isolamento de cache e erros, sem substituir esse piloto.
- A revisão independente examina o delta e os testes em memória. Após autorização, as duas migrations foram aplicadas. RLS, grants, defaults e triggers foram conferidos no catálogo; o lote vazio foi executado e o painel recusou uma chamada sem sessão. As mutações com usuário real, concorrência e entrega real continuam sem validação operacional.
- Os sete backends publicados foram lidos de volta e correspondem aos pacotes revisados. As chamadas HTTP sem autenticação foram recusadas. O novo cron do GT3 respondeu 200, com zero falhas e zero envios; nenhum workspace está habilitado. O relatório diário mantém seu agendamento.
- O cron GT3 visita workspaces e páginas em lotes, uma vez por minuto, sujeito à fila e disponibilidade. Não existe garantia de envio no segundo exato nem transação distribuída Desk–GT3.
- A publicação inicial não incluía integração de agenda; a extensão publicada em 04/11 está descrita abaixo. Não há reconstrução de desempenho anterior à ativação nem preenchimento automático de feriados. A retenção específica dos novos registros não foi definida.

**Migrations aplicadas com autorização expressa. Validação de catálogo, estado inicial e leituras limitada ao modo desligado; fluxo ativo com usuários reais ainda pendente.**

## Publicação e pendências

O usuário autorizou expressamente os dois ambientes e os sete backends nesta etapa. Não foram aplicadas migrations antigas nem criados casos artificiais em produção. Registro e evidências: [release do backend](handoffs/2026-11-03-tempo-resposta-backend-release.json).

- Desk (`<project-ref>`): arquivo aprovado `20261103184950_tempo_resposta_estrategistas.sql`, registrado pelo MCP como versão `20261103191005`. Inclui somente a correção de autenticação do cron legado identificado, sem mudar seu horário nem criar outro job.
- GT3 (`opbdoulspzlabxzevffc`): arquivo aprovado `20261103184932_iris_response_alerts.sql`, registrado pelo MCP como versão `20261103191032`. Adiciona o opt-in e job de alertas, sem workspaces habilitados.
- Publicados: Desk `tempo-resposta-admin` v1, `iris-gt3` v9, `uazapi-webhook` v87, `uazapi-send-message` v60, `chat-sla-monitor` v35; GT3 `iris-workspace` v4 e `iris-response-alerts` v1.
- Pendentes: homologação autenticada, calendário, identificação dos responsáveis e piloto autorizado antes de ativar. Interface publicada não significa monitor ativado.

Os pacotes de backend preservaram os módulos em produção fora deste delta. Os repositórios contêm alterações anteriores ao monitor; não incluir todo o estado local em um único commit. Antes de qualquer `db push` futuro, reconciliar os nomes dos arquivos aprovados com as versões geradas pelo MCP, sem reaplicar o SQL nem alterar o histórico remoto. Manter o monitor e os workspaces desligados até conferir calendário, autoria, acessos e piloto autorizado.

O advisor sinaliza [RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) nas oito tabelas novas e [funções administrativas SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). São escolhas explícitas deste desenho: as tabelas não concedem acesso direto ao navegador; as cinco RPCs de usuário executam o gate de sessão, empresa, atividade, perfil e permissão administrativa. Os grants e o bloqueio sem sessão foram conferidos. Isso não substitui a homologação com usuários reais de perfis diferentes.

## Simplificação do uso diário — 04/11/2026

Feedback do usuário: o fluxo estava confuso e registrar pausas manualmente é inviável. O painel passa a abrir nas conversas aguardando resposta; o tempo individual fica nos detalhes. Resultados e definição de responsáveis ficam recolhidos, mantendo pendências visíveis. O formulário de criação de pausa foi retirado, sem apagar registros ou alterar as permissões do backend. Pausas anteriores ativas continuam visíveis e encerráveis.

Essa simplificação, isoladamente, não acrescentou desconto automático de reuniões. Os registros de presença em salas internas do GT3 não foram conectados ao monitor. A extensão de Google Agenda descrita abaixo teve o backend publicado posteriormente e ainda aguarda validação com conta real. A espera do cliente não deve ser tratada como desempenho pessoal.


## Pausas manuais de volta como opção — 06/11/2026

Na integração do trabalho local com a main (PR #31), o formulário de pausa voltou ao painel, dentro do bloco recolhido **Pausas manuais (opcional)**. O uso diário continua o descrito acima: a equipe responde normalmente, sem registrar pausas. O bloco serve só para quem quiser registrar uma pausa pontual; fechado, ele não aparece no fluxo. A coluna **Tempo do responsável atual** também voltou à lista de conversas. Se a decisão de 04/11 de não oferecer pausas manuais continuar valendo, basta retirar o bloco do `TempoRespostaTab`; nenhum dado ou permissão depende dele.

## Google Agenda via Zernio — backend publicado em 04/11/2026

Estado desta extensão: migrations aplicadas e backend publicado em produção em 04/11/2026, com autorização expressa. Estruturas, RLS, grants e assinaturas foram conferidos no catálogo; as chamadas sem sessão, token da ponte ou segredo do cron foram recusadas. Isso não comprova a conexão OAuth, o isolamento com sessões reais nem o desconto em uma conversa real, ainda pendentes. A publicação não altera a ativação do monitor. Cada membro conecta sua conta em **GT3 → Configurações → Minha agenda**, por OAuth hospedado pela Zernio; o administrador cadastra a chave Zernio do workspace uma vez em Integrações. O Account ID administrativo pertence somente à exportação de eventos e passou a ser opcional para disponibilidade pessoal. Nenhuma chave é solicitada aos estrategistas.

O módulo consulta somente `free-busy` da conta pessoal vinculada pelo servidor; não lê títulos, convidados, descrição ou links. A permissão Google oferecida pela Zernio é mais ampla (leitura e escrita de agenda), informada antes de conectar. Esta extensão não cria, altera ou apaga eventos e não habilita agendamento pela Íris. Desconectar interrompe o uso no GT3; revogar o OAuth no Google/Zernio é uma ação separada do próprio usuário.

Períodos ocupados confirmados adiam os alertas e reduzem somente o tempo individual. A espera do cliente e os limiares de 30/50/60 minutos úteis permanecem. Isso significa que, após uma ocupação terminar, um cliente que já esperou mais de uma hora pode gerar um aviso imediatamente. A agenda indica ocupação cadastrada, não presença comprovada. Almoço, feriado e intervalos sobrepostos não são descontados duas vezes.

A consulta cobre no máximo os últimos sete dias e as próximas 24 horas, nunca antes da conexão. O cron busca atualizar contas em lotes de até dez, no mínimo dois minutos entre tentativas; validade para avisos de cinco minutos. Falhas, múltiplas fontes, troca de vínculo, revogação ou cobertura insuficiente ficam explícitas. Falha/stale não vira zero reuniões; não se exibe tempo individual sem cobertura. Enquanto a fonte estiver indisponível, os avisos individuais do monitor aguardam. O painel segue mostrando a espera do cliente.

Busy pertence à pessoa, workspace e geração de sincronização. O Desk recebe apenas início/fim, cobertura, instante e revisão; rejeita vínculo de teste que imita outro estrategista. Ao encerrar um episódio, congela a disponibilidade conhecida para não recalcular o histórico com uma agenda posteriormente alterada. Episódios anteriores não recebem desconto retroativo inventado. O painel não recebe a lista de busy. A última janela é substituída, e ao desconectar a lista é removida; snapshots de episódios encerrados acompanham o histórico de atendimento, cuja retenção operacional ainda não foi definida. Pendências OAuth expiram em 15 minutos e o job remove seus hashes expirados.

Migrations aplicadas sem reaplicar as anteriores: Desk `20261104164519_tempo_resposta_agenda_ocupada.sql`; GT3 `20261104164611_iris_calendar_personal.sql`. A conferência de catálogo retornou os controles esperados; não executou RPCs de escrita nem criou casos reais. Publicados: Desk `iris-gt3` e `tempo-resposta-admin`; GT3 `iris-calendar`, `iris-calendar-sync`, `tenant-integrations` e `integration-probe`. As quatro chamadas HTTP negativas retornaram 401, 401, 403 e 401, conforme esperado. Validação OAuth real, isolamento com usuários autenticados e desconto real permanecem pendentes; catálogo e recusa de chamadas anônimas não equivalem a homologação integral.

Verificações desta extensão: builds Desk/GT3 aprovados; Deno dos novos endpoints aprovado; 72 testes Desk passaram e 1 prévia opcional foi ignorada, seguidos de 7 testes pertinentes para a última revalidação administrativa. GT3: 40 testes focados cobrindo interface, OAuth, disponibilidade, credenciais e adaptador (a última alteração é um teste adicional de Account ID opcional). Tipagem global mantém os 188 diagnósticos Desk e 53 GT3 da base, sem novos. A página pública de segurança do GT3 foi conferida na aplicação compilada no navegador; o fluxo de conexão autenticada aguarda login, consentimento e validação reais. Revisão independente: [recibo do delta](handoffs/2026-11-04-iris-zernio-audit-response.json).

O job de sincronização executou automaticamente duas vezes e respondeu HTTP 200 com `checked=0`, pois ainda não havia contas conectadas. Isso confirma o acionamento do cron e sua autenticação, sem comprovar consulta real de disponibilidade. Evidência: [recibo da publicação](handoffs/2026-11-04-iris-zernio-publicacao.json).
