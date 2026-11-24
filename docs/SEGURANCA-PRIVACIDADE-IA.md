# Segurança, privacidade e IA — matriz restrita de evidências

Data: 27/10/2026 BRT. Responsável por esta atualização: manutenção do projeto, por agente Codex; validação e publicação cabem à administração. Operador nominal/encarregado de privacidade: não informado nesta revisão.

Snapshot de referência: `23e8b64` com alterações locais da área Íris e desta página. O hash isolado não cobre o estado de trabalho; vincular a revisão final ao commit efetivamente publicado. Ambientes observados: arquivos locais e prévia Vercel do PR13. Na prévia, a rota sem sessão encaminhou ao login; após login feito pelo usuário, foram observados Íris → segurança/IA → Continuidade → Área da Íris. Evidência local: `/private/tmp/omnx-iris-seguranca-autenticada.jpg`. Não foram executados testes globais de identidade/RLS, restauração ou verificação contratual de fornecedor.

Página sanitizada: `/seguranca`, para público interno autenticado, sob o `ProtectedRoute` existente e fora dos gates de apps. Fonte pura, sem consulta ou dado pessoal: `src/pages/SegurancaPage.tsx`. Links: rodapé de `AppLayout` e área Íris. A página não declara certificação, proteção integral ou SLA.

## Promessa, evidência e limite

| Afirmação da página | Controle | Fonte examinada | Estado / limite | Responsável operacional |
|---|---|---|---|---|
| Acesso autenticado e permissões por recurso | AUTHN/AUTHZ, SEC-TRUST-02 | `src/components/auth/ProtectedRoute.tsx`, `src/hooks/usePermissoes.ts`, `src/pages/automacoes-wa/AutomacoesWaConfigPage.tsx` | Implementação no código; não é teste positivo/negativo de todas as identidades nem da produção | Administração da empresa e manutenção |
| Troca da senha inicial no próximo login | AUTHN/AUTHZ, SEC-TRUST-02 | `src/lib/authSession.ts`, `src/lib/passwordChangeRequest.ts`, `desk-change-password`, migration `20261105172104_password_change_next_login.sql` | Sessões anteriores preservadas pela data da sessão real; liberação após Auth nativo confirmado, com recibo de recuperação vinculado à pessoa/sessão/geração. A marcação não invalida a senha anterior. Validação e publicação registradas no handoff desta entrega; troca real pelos titulares não executada pelo agente | Administração da empresa e manutenção |
| Isolamento por empresa e memória restrita | TENANT/AUTHZ | `supabase/migrations/20261027101000_automacoes_wa_agente_aprendizados.sql`, `20261027150000_cliente_relacionamento.sql`, `src/hooks/useAutomacoesWaAgentePainel.ts` | RLS e gates previstos; não inferir cobertura global ou aplicação atual das migrations | Administração da empresa e manutenção |
| Credenciais ficam nas integrações de servidor, sem exposição na página | SECRET/OUTPUT | `supabase/functions/_shared/wa-agente-llm.ts`, `_shared/wa-midia.ts`; fonte de `/seguranca` | Referências a secrets, sem leitura dos valores; não constitui busca completa por segredos | Manutenção |
| Canal real de reporte e acompanhamento | INCIDENT, SEC-TRUST-01/02 | `src/components/suporte/ReportarProblema.tsx`, `src/pages/MeusReportesPage.tsx`, `src/pages/ReportesPage.tsx`, `docs/SISTEMA-DE-TICKETS.md` | Botão abre formulário com captura revisável; autor acompanha protocolo; admins fazem triagem. Sem e-mail/DPO ou SLA inventado | Administração da empresa |
| Dados operacionais e contexto técnico têm finalidade de atendimento/gestão | PRIV/DATA | `docs/prd.md` §0, `docs/ARQUITETURA.md`, `docs/SISTEMA-DE-TICKETS.md` | Classes gerais identificadas; não substitui inventário completo de tratamento ou base jurídica | Administração da empresa |
| Claude e Gemini são acessados por OpenRouter nos fluxos examinados | LLM/VENDOR | `supabase/functions/_shared/wa-agente-llm.ts`, `_shared/wa-humanizar.ts`, `_shared/wa-midia.ts`, `wa-relacionamento-analisar/index.ts` | Código define famílias/modelos e conteúdo de requisições. Modelos configurados em produção não foram consultados | Manutenção e fornecedores contratados |
| Solicitação de coleta negada nas chamadas de IA | LLM/PRIV/VENDOR | `provider.data_collection: 'deny'` nas fontes anteriores | Verificado como parâmetro enviado pelo código. Termos atuais, cumprimento pelo fornecedor, treinamento, retenção e regiões da cadeia permanecem desconhecidos | Administração/contratante e fornecedores |
| Preferências dependem de instrução explícita; não há treinamento passivo de todo chat | LLM/AUDIT | `supabase/functions/_shared/wa-agente-ferr-aprendizado.ts`, `src/lib/automacoesWaAprendizado.ts`, `src/components/automacoes-wa/IrisConhecimento.tsx` | Preferência validada fica ativa; categorias estilo/conteúdo/relatório/outro, autor/origem/data; não há estados fictícios de aprovação. Exclusão remove registro, desativação preserva | Administração e equipe autorizada |
| Resolução de alerta por declaração direta no WhatsApp | AUTHZ/TENANT/LLM/AUDIT | `_shared/wa-agente-ferr-alertas.ts`, `_shared/wa-agente-cerebro.ts`, `wa_auto_alertas_ignorados` | Um tipo de alerta de um cliente, modo resolvido; intenção e alvo na mensagem original. Admin do módulo fora de grupo interno de acesso total; participantes desses grupos podem resolver sem cadastro. Pedido e autoria disponível rastreados. Não altera cadastro ou contrato, não disponível no GT3. Validação local e teste real são evidências distintas | Administração e equipe autorizada |
| Duas alterações de cadastro com prévia e confirmação | AUTHZ/TENANT/LLM/AUDIT | `_shared/wa-agente-acoes-core.ts`, `_shared/wa-agente-ferr-acoes-cadastro.ts`, `_shared/wa-agente-entrada-integridade.ts`, migration `20261028171558_iris_chat_acoes_cadastro.sql` | Ativo do cliente ou FK de contrato sem vínculo. Grupo interno, membro ativo identificado, admin de Automações WhatsApp, edição do módulo e carteira atual. Hash da entrada autenticada, confirmação posterior da mesma pessoa/chat, cinco minutos, estado esperado e recibo transacional. Encaminhamento sem metadado permanece desconhecido. Estrutura aplicada e RLS/ACLs conferidos no catálogo instalado; gravação real não verificada. GT3 excluído | Administração e manutenção |
| Perfil administrativo orienta personalidade/contexto sem ampliar ferramentas ou acesso | AUTHZ/TENANT/LLM | `wa-agente-admin/index.ts`, `_shared/wa-agente-perfil.ts`, `_shared/wa-agente-prompt.ts` | Padrão `iris-v1`; 32 mil caracteres por campo; uma linha namespaced por tenant em `app_settings`, com autoria e revisão/CAS. Modo restrito não consulta o perfil. Revisão estática e testes com banco em memória; não é prova global de RLS | Administração e manutenção |
| Memória é resumo analítico por cliente, sujeito a conferência | LLM/DATA | `wa-relacionamento-analisar/index.ts`, `20261027150000_cliente_relacionamento.sql`, `IrisConhecimento.tsx` | Não é transcrição integral, verdade garantida ou treinamento de pesos | Administração e equipe autorizada |
| Pedidos 30 d; execuções/envios e uso de prévias 90 d; histórico de relacionamento 180 d | DATA/PRIV | `20261027090000_automacoes_wa_agente_base.sql` retenção; `20261026160000_automacoes_wa_relatorio_diario.sql`; `20261027150000_cliente_relacionamento.sql` job `wa-relacionamento-hist-retencao-180d` | Prazos previstos em SQL. Execução dos jobs, exclusão efetiva e cópias de segurança não observadas | Manutenção/operação |
| Sem prazo geral confirmado para demais registros | DATA/PRIV | Schemas de aprendizados/relacionamento e documentação de suporte examinados | Desconhecido: cadastros, conversas, mídias, resumo atual, preferências e anexos. Não aplicar os 90 dias de logs a todos os dados | Administração da empresa |
| Exportação/exclusão são específicas por recurso | PRIV/DATA | `src/components/contratos/ExportContratosDialog.tsx`, `src/hooks/useClientes.ts`, `src/hooks/useComissoes.ts`, hooks de aprendizados | Existe exportação CSV de contratos e operações específicas; nenhum fluxo unificado de portabilidade/apagamento em todos os módulos/fornecedores foi demonstrado | Administração da empresa |
| HTTPS e fornecedores descritos na arquitetura | CRYPTO/VENDOR | `docs/ARQUITETURA.md` §§1, 4, 5, 8 | Declarado em documentação: Supabase, Vercel/Cloudflare, WhatsApp, IA, CRM, e-mail, documentos e comunicação. Ativação por empresa, TLS efetivo, criptografia em repouso e regiões de processamento não verificados | Administração/contratante e fornecedores |
| Backups, RPO/RTO e último teste observado não confirmados | RESILIENCE | `docs/ESTRATEGIA-DE-ROLLBACK.md`; cópia pontual de vínculos descrita em `20261027110000_cliente_canais.sql` | Cópia pontual/reversão não comprova backup integral. Objetivos e valores medidos de RPO/RTO, cobertura, retenção e teste de restauração: desconhecidos | Administração/operação |
| Sem certificação do produto ou auditoria independente declarada | AUDIT, SEC-TRUST-02 | Escopo desta revisão local | Não apresentar resultado de scanner/teste local nem certificação de fornecedor como certificação do Desk | Administração/manutenção |

## Divergência encontrada e tratamento

A revisão encontrou uma divergência: o diagrama de `docs/ARQUITETURA.md` mencionava 365 dias, enquanto a migration contém `DELETE ... interval '180 days'`. A divergência foi corrigida nesta entrega: arquitetura, migration e página agora informam **180 dias previstos no código**, sem afirmar execução em produção.

Não foi identificado contato externo nominal de segurança/privacidade, encarregado, política jurídica formal aprovada ou contrato de fornecedor nesta revisão. O canal interno existente é informado como tal, sem representar um canal externo inexistente. Prazos de atendimento e resolução permanecem sem compromisso formal demonstrado.

## Validação e manutenção

Delta local de 06/11/2026 — tickets WhatsApp: prova privada guarda IDs de mensagem, empresa, conversa, contato, instância e canal, autoria, horários e hash do texto original. Somente ingresso autenticado recente atesta a prova; eco, heurística, recuperação e citação não autorizam efeito. O caminho compatível de comando exige equipe identificada e permissão. A correção posterior do dono estabelece detecção automática por conversa natural: cliente ou equipe podem fornecer evidência, sem código obrigatório. A IA classifica solução completa e vínculo inequívoco, e o worker confere referências reais atestadas, mesma empresa/cliente/conversa, revisão e reabertura antes de atualizar somente o ticket. Replay é idempotente; falha transitória da ponte não avança o cursor da análise. Motivo curto, IDs de evidências, modelo e versão do classificador ficam registrados, sem raciocínio interno. Cada baixa gera recibo privado na mesma transação; reabertura ou mudança manual da etapa limpa os campos atuais sem apagar esse recibo. A tabela tem RLS/ACLs restritas e bloqueios de atualização/exclusão/truncate preparados, ainda sem execução em banco. A revisão semântica real ainda não foi executada; confiança alta e formato válido não comprovam acerto. A nova agenda/reentrada e a reserva de uso por empresa/dia estão somente preparadas em SQL, mantendo modelo/limites existentes; timeout conserva reserva de custo. Retenção específica da prova e das tentativas não definida; nenhum dado real gravado nesta tarefa. Migration preparada e revisada estaticamente; execução e validação em banco não realizadas.

Delta local de 06/11/2026 — ajuda interna: autenticação JWT e perfil ativo de
equipe sob RLS; pergunta até 1.000 caracteres e histórico limitado às seis
mensagens recentes, sem aceitar mensagens de sistema/ferramentas do navegador.
Contexto de usuário/empresa só restringe a identidade já verificada no servidor.
Fonte canônica é o manual público; nenhuma ferramenta operacional é oferecida
à IA. Renderização como texto React; IDs de fontes e destinos fixos validados.
A troca de sessão/empresa desmonta histórico e invalida resposta em voo.
Perguntas podem conter dados digitados pela pessoa: a UI e `/seguranca` avisam
do envio ao provedor configurado e pedem não incluir dados de clientes/segredos.
Histórico local não define retenção do provedor. Limites de uso por instância
não são cota distribuída. Função nova não publicada nesta etapa; testes sintéticos
não comprovam autenticação/RLS nem resposta real em produção.

Delta local de operações no WhatsApp, 03/11 às 18h: consulta de até 20 nomes
projetada pela carteira, sem valores; exclusão geral reversível de avisos e
alertas ativos com membro/admin identificado, origem atual e lease revalidadas;
lista de até dez responsáveis com prévia persistida e confirmação da mesma
pessoa/chat, destino elegível, revisão e execução integral ou rollback. A ponte
privada deriva ator/tenant da proposta/pedido e preserva os gates do histórico
operacional, sem forjar sessão de usuário. Contratos e comissões não participam
da nova ação. SQL apenas preparado/revisto; publicação e execução em banco ainda
pendentes. Evidências e limites no handoff de operações do Jin; não apresentar
teste sintético ou revisão SQL como execução real.
Recibos determinísticos de listas usam orçamento ampliado de saída para não
cortar itens/identificador depois da execução. Códigos e UUIDs vindos do executor
validado são preservados somente nas linhas fechadas do formatter e por lista
permitida; não há isenção genérica de número/UUID produzido pelo modelo. Demais
máscaras de dados pessoais, links e bloqueios de vazamento permanecem aplicados.

Delta local de 03/11/2026, posterior ao webhook v85 publicado: áudio em grupo
interno de acesso total usa o mesmo escopo de texto e só responde à chamada pelo
nome ou menção/citação. O parser de resolução remove somente o prefixo de áudio
gerado pelo aplicativo; negações, hipóteses, citações e permissões continuam
verificadas fora do modelo. Preferências de apresentação entram como dados de
menor prioridade na humanização; listas e fatos continuam construídos e validados
deterministicamente. Janela temporal usa metadados da última mensagem identificada
como cliente, sem transmitir conteúdo adicional de conversa; casos históricos
permanecem no painel e não são considerados resolvidos. Consultas de chat mantêm
filtros de carteira antes de expor a classificação. Evidência: testes sintéticos
e código no handoff de 03/11; naquele momento, publicação e teste real estavam pendentes.
As afirmações gerais da página `/seguranca` permanecem compatíveis: ferramentas
restritas, preferências explícitas, transcrição via provedor configurado e limites
de verificação operacional. Não foi alterada a rota nem feita nova verificação
de navegação; a evidência de 27/10 permanece atribuída àquela prévia.

Atualização operacional de 03/11 às 13h25 BRT: após autorização explícita das
seis funções, o lote foi publicado no Desk e seus pacotes retornados conferidos
(137 fontes executáveis, sem divergência; 22 suportes de tipos não retornados
no diário, com grafo runtime completo confirmado). Versões, hashes, autorização
e limites em `handoffs/2026-11-03-iris-feedback-release.json`. A correção adicional
do parser de idioma preserva negações e tem recibo próprio. Os dois áudios reais
foram transcritos usando a credencial do Vault sem exportá-la e salvos nas
mensagens originais. Nenhum cadastro/contrato foi alterado. A publicação não
constitui teste de uma nova resposta real no WhatsApp; essa observação segue pendente.

Delta Íris GT3 de 27/10/2026: vínculo ativo concede alertas operacionais somente
da carteira autorizada, sem grant global de painel. Satisfação contextual usa
amostra das conversas das instâncias permitidas na execução atual, sem memória
administrativa ou gravação de aprendizado. Janela, amostra e falta de dados
acompanham a avaliação. A página informativa foi atualizada para esse fluxo;
isso não demonstra testes entre contas reais ou todos os tenants.

Delta de 28/10/2026: a página descreve a resolução declarada de alertas no
WhatsApp e explicita o poder dos participantes de um grupo de acesso total.
O registro usa o mecanismo já existente no painel; a guarda de aprendizado
após leitura permanece. A consulta de atualidade do relatório usa somente
metadados autorizados da timeline, sem acrescentar texto de conversa à coleta.
Baixar um alerta não comprova encerramento contratual. Testes sintéticos e
simulação não comprovam uma gravação real pelo WhatsApp; a publicação deve
registrar separadamente o que foi efetivamente observado.

Delta seguinte de 28/10: as duas novas ações exigem autoria identificada e
permissões de edição, mais restritas que a resolução de alertas em grupo de
acesso total. A confirmação não pode confiar apenas no texto atual de
`chat_messages`, que pode ser editado: o webhook deve atestar o texto original
elegível em `wa_agente_pedidos`, de escrita restrita ao servidor. A proposta e
o recibo têm tabela própria com RLS, sem acesso do navegador. Não foi definido
um prazo de retenção para essa nova trilha; não atribuir a ela os 30 dias da
fila nem os 90 dias dos logs. A migration autorizada foi aplicada no Desk de
produção e suas ACLs/RLS foram conferidas no catálogo. O MCP registrou a versão
20261028171558 para o mesmo SQL preparado como 20261028164628; somente o nome do
arquivo novo foi sincronizado. Nenhuma alteração real de cadastro por essas
ações foi executada como teste.

- `SEC-TRUST-01`: navegação positiva autenticada e encaminhamento anônimo ao login observados na prévia do PR13, incluindo links de origem e retorno. Isso não cobre todas as identidades nem a produção. A página é software interno e permanece atrás do login.
- `SEC-TRUST-02`: matriz de consistência preparada com fontes e limites. É auto revisão local; não equivale a parecer independente ou verificação de produção.
- Revalidar quando mudar dado transmitido, fornecedor, acesso, retenção, operação de backup, política ou compromisso. Confirmar data/snapshot e execução antes de transformar um estado desconhecido em verificado.
- Teste de apresentação pode renderizar `SegurancaPage` isoladamente: não depende de contexto de autenticação, roteador, backend ou dados reais. A proteção da rota pertence ao wrapper existente em `App.tsx`.

Este documento é uma matriz técnica restrita, não um segundo backlog, certificação ou autorização de publicação. Não contém credenciais, payloads de conversa ou achados exploráveis.
Em 05/11/2026, foram publicadas as correções de corpo próprio citado, pedidos mistos e memória operacional por grupo. A memória usa `wa_agente_fatos_equipe`, preserva autoria, fonte e data, exige administração e carteira completa e admite desativação explícita pelo WhatsApp. A retenção geral destes relatos continua sem prazo definido. Quatro migrations e três pacotes foram publicados e conferidos. Foram reconciliadas 11 operações de responsáveis, importados dois relatos e aplicadas seis exclusões dos avisos por autorização administrativa atual, com executor identificado, sem reabrir pedidos antigos. O recibo de execução e seus limites estão em `handoffs/2026-11-05-iris-recuperacao.json`.

Atualização posterior ao delta de 06/11/2026 (ajuda interna): função iris-ajuda publicada com JWT obrigatório e fontes conferidas. Testes sintéticos e catálogo não comprovam autenticação/RLS nem resposta real em produção.
