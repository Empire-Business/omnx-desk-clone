import type { ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { TabelaResponsiva } from '@/components/ui/TabelaResponsiva'

const SECOES = [
  ['responsabilidade', 'Responsáveis e contato'], ['dados', 'Dados e proteção'], ['ia', 'Uso de IA'],
  ['fornecedores', 'Fornecedores'], ['retencao', 'Retenção e direitos'], ['continuidade', 'Continuidade'],
] as const

const FORNECEDORES: [string, string][] = [
  ['Supabase', 'Autenticação, banco de dados e arquivos.'],
  ['Vercel e Cloudflare', 'Hospedagem da aplicação web e tráfego de acesso.'],
  ['UAZAPI ou Zernio', 'Integração de mensagens do WhatsApp, conforme a configuração da empresa.'],
  ['OpenRouter, Anthropic e Google', 'Intermediação e processamento de IA nos fluxos descritos acima.'],
  ['GoHighLevel, Resend, CloudConvert e LiveKit', 'Integrações de CRM, e-mail, documentos e comunicação, conforme o recurso utilizado.'],
]

/** Página informativa pura: sem sessão, consultas, telemetria ou dados de clientes. */
export function SegurancaPage() {
  return (
    <PageContainer largura="leitura">
      <div className="space-y-4 border-b border-stroke-subtle pb-6">
        <PageHeader
          title="Segurança, privacidade e IA"
          description="Como os dados são usados no Desk e na Íris, quais controles existem no código e quais informações ainda precisam de confirmação pela administração."
        />
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">Revisão de código: 28/10/2026; complemento do monitor de resposta em 03/11/2026 e da agenda pessoal em 04/11/2026 e da ajuda interna em 06/11/2026. Escopo: aplicação interna, dados operacionais, Conversas e Íris. Esta revisão não confirma a configuração atual de produção. As verificações em produção descritas abaixo têm escopo limitado e não representam certificação.</p>
        <nav aria-label="Seções de segurança e privacidade" className="flex flex-wrap gap-x-4 gap-y-1">
          {SECOES.map(([id, nome]) => <a key={id} href={`#${id}`} className="focus-ds inline-flex min-h-11 items-center text-[13px] text-link underline-offset-4 hover:underline sm:min-h-8">{nome}</a>)}
        </nav>
      </div>

      <div className="rounded-lg border border-stroke-subtle bg-bg-1 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Como ler os estados:</strong> “Verificado no código” descreve uma implementação examinada nesta revisão. “Declarado na documentação” indica uma descrição ainda sem confirmação operacional. “Desconhecido” indica falta de evidência; não significa proteção comprovada.
      </div>

      <Bloco id="responsabilidade" titulo="Responsáveis e canal de contato" estado="Declarado na documentação">
        <p>A administração da empresa que disponibiliza seu acesso coordena os usuários, os dados e a operação do Desk. O nome do responsável por segurança ou privacidade e um canal externo específico não foram informados nesta página.</p>
        <p>Para relatar um incidente ou solicitar orientação sobre seus dados, use o botão <strong>“Reportar um problema”</strong> do aplicativo. Informe no título “Segurança” ou “Privacidade”, descreva o ocorrido e selecione a categoria “Outro”. A administração faz a triagem em Reportes; você acompanha o protocolo em Meus reportes.</p>
        <p>Revise a captura de tela e os anexos antes de enviar. Não inclua senhas, tokens ou dados pessoais desnecessários. O formulário permite retirar a foto da tela. Não há prazo formal de resposta ou resolução confirmado nesta revisão.</p>
        <a href="/meus-reportes" className="inline-flex items-center gap-1.5 font-medium text-foreground underline underline-offset-4">Acompanhar meus reportes <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></a>
      </Bloco>

      <Bloco id="dados" titulo="Dados tratados e controles de acesso" estado="Verificado no código">
        <p>O Desk trata identificação de usuários e colaboradores, contatos de clientes, contratos e informações financeiras, tickets, conversas, arquivos e mídias. Também registra protocolos de suporte e metadados de execução. A finalidade é operar o atendimento, a gestão de clientes, os contratos e as automações configuradas pela empresa.</p>
        <p>O acesso usa autenticação e permissões por recurso. Os dados são separados por empresa no banco; há políticas de acesso por linha e verificações de empresa nos fluxos de servidor examinados. A Íris consulta o que a pessoa ou o grupo autorizado pode acessar. Esses controles não equivalem a uma auditoria completa de todos os fluxos.</p>
        <p>A administração pode exigir a substituição de uma senha inicial no próximo login. Sessões anteriores à exigência continuam abertas, inclusive ao renovar o token. Novas sessões precisam concluir a troca antes de acessar os dados protegidos do Desk. A troca usa a API de autenticação com a identidade da própria pessoa; quando ela salva a nova senha, o Supabase mantém essa sessão e encerra as outras sessões da conta. A senha anterior continua válida na autenticação até ser efetivamente alterada.</p>
        <p>As integrações usam credenciais no servidor. Elas não são exibidas nesta página. O canal de reporte coleta contexto técnico e inclui mecanismos para mascarar credenciais; isso não torna seguro anexar qualquer conteúdo sem revisão.</p>
        <p><strong>Monitor de tempo de resposta — backend publicado, ativação pendente:</strong> registra horários, autoria identificada, responsáveis, trocas, pausas e recibos para acompanhar a meta de atendimento. O painel exige administração da Íris; o aviso privado no GT3 confere a carteira autorizada. Os avisos usam texto fixo, sem uma nova chamada de IA. A retenção específica desses registros ainda não foi definida. As migrations foram aplicadas e as permissões do catálogo foram conferidas em produção; o fluxo ativo com usuários reais ainda precisa de validação.</p>
        <p><strong>Agenda pessoal via GT3/Zernio — backend publicado, homologação pendente:</strong> o acompanhamento recebe apenas intervalos ocupados, cobertura e estado da consulta, vinculados à pessoa e ao workspace. Títulos, convidados e links de reuniões não são consultados por este fluxo. Os intervalos não são enviados à IA nem apresentados no painel administrativo; servem ao cálculo do tempo individual. A espera do cliente permanece. Ao encerrar uma conversa, a disponibilidade então conhecida fica preservada no histórico. O prazo de retenção desse histórico ainda não foi definido. Conectar não ativa alertas, e desconectar no GT3 não revoga automaticamente a autorização Google/Zernio. A permissão Google oferecida pela Zernio inclui leitura e escrita de agenda; este módulo consulta apenas disponibilidade. O backend e as novas migrations foram publicados em 04/11/2026. As estruturas e permissões do banco foram conferidas, e chamadas sem autenticação foram recusadas. A autorização Google, o isolamento com sessões reais e o desconto em uma conversa real ainda precisam ser validados.</p>
        <p><strong>Tickets de WhatsApp — serviço publicado; uso real pendente:</strong> o vínculo guarda identificação e horários da mensagem de origem, canal e pessoa da equipe, além de uma impressão do texto para conferir se ele foi alterado. A conclusão automática usa mensagens de origem conferida e evidência de solução do pedido na mesma conversa, reconhecida pela IA, sem comando obrigatório; encerrar a conversa não encerra todos os pedidos. O prazo específico de retenção dessa prova ainda não foi definido. As permissões previstas foram conferidas na configuração instalada. O uso com pessoas e as atualizações simultâneas ainda precisam de conferência.</p>
        <p><strong>Criptografia — declarado na arquitetura:</strong> a aplicação prevê conexões HTTPS. A configuração efetiva de transporte, criptografia em repouso, gestão de chaves e cobertura de todos os fornecedores não foi verificada nesta revisão.</p>
      </Bloco>

      <Bloco id="ia" titulo="Como a Íris e os recursos de IA usam os dados" estado="Verificado no código">
        <p><strong>Ajuda interna — serviço publicado; teste real de respostas pendente:</strong> o botão “Ajuda com a Íris” orienta sobre o uso do Desk a partir do manual público. A pergunta e até seis mensagens recentes dessa conversa de ajuda podem ser enviadas ao provedor de IA configurado. Não inclua dados de clientes, informações pessoais ou senhas. Esse fluxo não consulta cadastros nem executa ações. A conversa fica na memória da página e é descartada ao trocar a sessão; isso não define a retenção do provedor externo. Quando a IA está indisponível, a interface identifica a consulta ao manual. O limite de uso é por instância do serviço, sem garantia de cota global.</p>
        <p>Os fluxos examinados usam OpenRouter para acessar modelos Claude, da Anthropic, e Gemini, do Google. Claude é usado em respostas, resumos e análises; Gemini participa da transcrição de áudio e descrição de imagens. Os modelos efetivos dependem da configuração do servidor.</p>
        <p>Conforme a função acionada, podem ser enviados textos de conversas, contexto autorizado de clientes, resumos anteriores, preferências explícitas da equipe e conteúdo de áudio ou imagem. Há minimização e pseudonimização em determinados fluxos; não há garantia de anonimização de todo conteúdo transmitido.</p>
        <p>As chamadas examinadas solicitam roteamento com coleta de dados negada. Isso descreve o pedido feito pelo código: os termos contratuais vigentes, uso para treinamento, retenção e países de processamento de toda a cadeia de fornecedores <strong>não foram verificados</strong>.</p>
        <p>Personalidade e contexto são instruções ensinadas explicitamente pela equipe. Uma preferência validada pode ficar ativa nas respostas seguintes; não há treinamento automático do modelo a partir de toda conversa. A memória por cliente reúne resumos e sinais do relacionamento, que podem conter erros e devem ser conferidos nos registros de origem.</p>
        <p>Um contrato pode atender mais de um cliente. Cada cadastro mantém suas conversas, responsáveis e análise da Íris. Associar outro cliente ao contrato não libera acesso às conversas dos demais nem amplia as permissões financeiras. Quando um atendimento antes conjunto é separado, a análise atual precisa ser refeita com as conversas de cada cliente; os registros antigos continuam como histórico da configuração anterior.</p>
        <p>No GT3, a Íris apresenta alertas e avalia satisfação somente dos clientes da carteira autorizada para a pessoa naquele workspace. A avaliação contextual usa uma amostra das conversas permitidas, informa seus limites e pode ser indeterminada quando faltam mensagens do cliente. Essa análise não atualiza a memória administrativa nem concede acesso às carteiras de colegas.</p>
        <p>A memória operacional dos grupos guarda declarações literais sobre pessoas e clientes, com autor, data e grupo de origem. O acesso exige administração autorizada e carteira completa. Os relatos podem ser consultados e desativados pelo WhatsApp e podem divergir do cadastro, que deve ser conferido para executar alterações.</p>
        <p>As ferramentas podem consultar informações e, quando permitido, registrar preferências ou ajustar opções do aviso diário. Elas continuam sujeitas ao acesso da pessoa e do canal. A administração pode revisar, desativar ou excluir preferências; respostas de IA não substituem a conferência humana.</p>
        <p>No WhatsApp autorizado, uma declaração direta da equipe pode registrar um tipo de alerta de um cliente como resolvido. O registro identifica o pedido de origem e segue o mecanismo de resolução do painel; não encerra contratos nem altera cadastros. Fora dos grupos internos configurados com acesso total, a operação exige administração da Íris. Nos grupos de acesso total, os participantes podem resolver alertas sem cadastro individual. Esta operação não está disponível no canal privado de carteira do GT3.</p>
        <p>Quando habilitadas, as alterações de cadastro pelo grupo interno permitem ativar ou inativar um cliente e associar um contrato ainda sem vínculo ao cadastro correto. Exigem membro identificado, administração da Íris e permissão de edição do módulo. A Íris apresenta uma prévia; a mesma pessoa precisa confirmar o código em uma nova mensagem no mesmo grupo, em até cinco minutos. Cliente com contrato não encerrado não pode ser inativado por esse fluxo. Essas ações não ficam disponíveis nas conversas de carteira do GT3.</p>
        <a href="/ia" className="inline-flex items-center gap-1.5 font-medium text-foreground underline underline-offset-4">Área da Íris <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></a>
        <p className="text-[13px] text-muted-foreground">A configuração da Íris exige a permissão de administração da Íris.</p>
      </Bloco>

      <Bloco id="fornecedores" titulo="Serviços externos e locais de processamento" estado="Declarado na documentação">
        <p>O projeto referencia os serviços abaixo. A lista não confirma que todos estejam ativos para sua empresa, nem comprova contratos ou regiões efetivas de processamento.</p>
        <TabelaResponsiva
          rotulo="Serviços referenciados e suas finalidades no projeto"
          linhas={FORNECEDORES}
          chave={([servico]) => servico}
          colunas={[
            { id: 'servico', titulo: 'Serviço', principal: true, celula: ([servico]) => <span className="font-medium text-foreground">{servico}</span> },
            { id: 'finalidade', titulo: 'Finalidade prevista', celula: ([, finalidade]) => finalidade },
          ]}
        />
        <p>A documentação descreve armazenamento do banco na região de São Paulo. Isso não estabelece onde todo dado circula: chamadas de IA, mensagens, e-mails e outros serviços podem ter processamento em locais diferentes. As regiões efetivas e eventuais transferências internacionais são <strong>desconhecidas nesta revisão</strong>.</p>
      </Bloco>

      <Bloco id="retencao" titulo="Retenção, exportação e exclusão" estado="Verificado no código">
        <p>Há prazos diferentes por classe de registro. Os prazos abaixo estão previstos nas rotinas do projeto; sua execução em produção e a remoção em cópias de segurança não foram observadas nesta revisão.</p>
        <dl className="grid gap-3 rounded-lg border border-stroke-subtle p-3 text-[13px] sm:grid-cols-2">
          {[
            ['Pedidos operacionais da Íris', '30 dias'], ['Execuções da Íris e histórico de envios', '90 dias'],
            ['Histórico do relacionamento por cliente', '180 dias'], ['Uso das prévias de relacionamento', '90 dias'],
          ].map(([dado, prazo]) => <div key={dado}><dt className="text-muted-foreground">{dado}</dt><dd className="mt-1 font-medium text-foreground">{prazo} previstos no código</dd></div>)}
        </dl>
        <p>Não foi confirmado um prazo geral de retenção para cadastros, conversas, mídias originais, resumos atuais, preferências da equipe e anexos de suporte. Desativar uma preferência mantém seu registro; excluí-la remove o registro pela operação disponível na área da Íris.</p>
        <p>Há exportações e exclusões em recursos específicos, conforme permissões. Não foi identificado um fluxo único que exporte ou apague todos os dados de uma pessoa em todos os módulos e fornecedores. Solicite esse atendimento à administração pelo canal de reporte; ela precisa avaliar o alcance e as obrigações de conservação aplicáveis.</p>
      </Bloco>

      <Bloco id="continuidade" titulo="Continuidade, incidentes e evidências" estado="Desconhecido nesta revisão">
        <p><strong>Backups:</strong> cobertura, frequência, prazo de conservação e procedimento de recuperação de produção não foram confirmados. Existem procedimentos documentados de reversão e cópias pontuais de determinados vínculos; isso não comprova backup integral do sistema.</p>
        <p><strong>Último teste de restauração observado:</strong> nenhum nesta revisão. Não foram confirmados objetivos de perda máxima de dados (RPO), prazo de recuperação (RTO), resultados medidos ou SLA formal.</p>
        <p><strong>Incidentes:</strong> o canal de reporte permite registrar e acompanhar relatos. A administração da empresa coordena a triagem e os próximos passos; responsáveis nominais, plano completo de resposta e compromissos de comunicação não foram verificados.</p>
        <p><strong>Auditorias e certificações:</strong> esta página registra uma revisão local de código. Não apresenta certificação do produto, auditoria independente ou selo de conformidade. Certificações de fornecedores, quando existentes, não certificam automaticamente o Desk.</p>
        <p><strong>Políticas e documentos:</strong> a documentação técnica e a matriz de evidências desta página são restritas à manutenção do projeto. Solicite à administração as políticas, termos e contratos aplicáveis à sua empresa; versões e aprovações desses documentos não foram confirmadas nesta revisão.</p>
      </Bloco>
    </PageContainer>
  )
}

function Bloco({ id, titulo, estado, children }: { id: string; titulo: string; estado: string; children: ReactNode }) {
  return <section id={id} className="scroll-mt-6 space-y-3 rounded-lg border border-card-border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="t-h4 text-foreground">{titulo}</h2><span className="tag">{estado}</span></div>
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </section>
}
