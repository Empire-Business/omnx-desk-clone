/** Conteúdo público e estático. Exemplos inteiramente fictícios; nenhuma consulta.
 * Fontes editoriais: navegação atual; telas de equipe, clientes, contratos,
 * produtos, atendimento, relatórios, configurações, Íris/GT3 e suporte.
 * Não importar dados privados nem apresentar módulos arquivados como ativos. */
export interface BlocoManual {
  titulo: string
  textos?: readonly string[]
  passos?: readonly string[]
  itens?: readonly string[]
  exemplo?: string
  nota?: string
}
export interface PerguntaManual { pergunta: string; resposta: string }
export interface TermoManual { termo: string; definicao: string }
export interface SecaoManual {
  id: string
  grupo: 'Primeiros passos' | 'Trabalho diário' | 'Íris e automações' | 'Para consultar'
  titulo: string
  resumo: string
  publico: string
  palavrasChave: readonly string[]
  blocos: readonly BlocoManual[]
  emPreparacao?: boolean
  perguntas?: readonly PerguntaManual[]
  termos?: readonly TermoManual[]
}

export const ATUALIZACAO_MANUAL = '7 de novembro de 2026'
export const SECOES_MANUAL: readonly SecaoManual[] = [
  {
    id: 'tempo-resposta', grupo: 'Íris e automações', titulo: 'Tempo de resposta dos estrategistas', publico: 'Administração da operação',
    resumo: 'A equipe responde normalmente. O sistema acompanha quem está esperando e avisa a pessoa responsável.',
    palavrasChave: ['tempo', 'resposta', 'prazo', 'SLA', 'estrategista', 'feriado', 'almoço', 'pausa', 'reunião'],
    blocos: [
      { titulo: 'No dia a dia: responder normalmente', textos: ['Depois da configuração inicial, o sistema acompanha as novas mensagens dos clientes e identifica a primeira resposta humana. A equipe não precisa iniciar cronômetros nem registrar pausas.', 'No painel Tempo de resposta, veja o cliente, o estrategista responsável, a espera e a situação da conversa. Para consultar uma resposta concluída, mude o filtro Situação. Os registros detalhados ficam em Ver detalhes e avisos.'], nota: 'A espera começa na primeira mensagem ainda sem resposta. Novas cobranças do cliente não zeram o relógio. Respostas automáticas da Íris não contam como resposta humana.' },
      { titulo: 'O que conta na meta de uma hora', textos: ['Contam segunda a sexta, das 9h às 12h e das 13h às 18h, no fuso de Brasília. Almoço, noites, fins de semana e os feriados cadastrados ficam fora da contagem.', 'Quando os avisos estiverem habilitados, a Íris lembra o responsável aos 30 e aos 50 minutos úteis e avisa quando passar de 60. A conversa continua limitada à carteira autorizada no GT3.'], exemplo: 'Mensagem às 11h40 e resposta às 13h20: 40 minutos úteis de espera.' },
      { titulo: 'Configuração inicial: feita pela administração', passos: ['Abra Íris (antes Automações WhatsApp) → Tempo de resposta → Começar acompanhamento. Se já estiver ligado, use Configurações. A aba Tempo de resposta aparece para administradores e gerentes.', 'Confira os feriados da empresa e confirme o ano. Selecione Observar e salve: o sistema começa a medir sem enviar alertas.', 'Acompanhe uma nova mensagem e sua resposta. Confira o cliente, o responsável e os minutos. Se aparecer Medição pendente, revise o vínculo da conversa e a identificação da equipe antes de avaliar o prazo.', 'Depois de conferir, escolha Observar e avisar no Desk e habilite Tempo de resposta dos clientes em GT3 → Configurações → Integrações → Íris. Revise os destinatários: a opção vale para as associações elegíveis de todo o workspace.'], nota: 'Essa preparação não se repete a cada conversa. Com um único estrategista vinculado ao cliente, o responsável é automático. Com vários, a administração escolhe em Responsáveis pelos avisos. Os feriados não são preenchidos automaticamente.' },
      { titulo: 'Conectar sua agenda, sem registrar pausas', textos: ['Quando a integração estiver liberada no seu workspace, abra GT3 → Configurações → Minha agenda → Conectar Google Agenda. Escolha sua conta de trabalho e confirme as permissões. Cada pessoa conecta a própria conta; a configuração Zernio é feita uma vez pelo administrador.', 'A conexão usa a Zernio. A autorização oferecida por ela permite ler e alterar a agenda, mas este acompanhamento consulta apenas horários ocupados, sem títulos, convidados ou links. Não é um recurso de agendamento pela Íris.', 'Durante um horário ocupado confirmado pela agenda, o aviso aguarda e esse período é descontado do tempo individual. A espera total do cliente continua visível. Se a agenda falhar ou não cobrir todo o período, o painel informa que o tempo individual não foi confirmado.', 'Exemplo: cliente escreveu às 10h, você tinha um horário ocupado das 10h10 às 10h40 e respondeu às 10h50. O cliente esperou 50 minutos; o tempo individual descontado foi de 20 minutos. Marcar um horário ocupado não comprova presença em reunião.', 'Conectar a agenda não ativa o monitor nem os avisos. Para parar as consultas, use Desconectar em Minha agenda. Para revogar também a autorização da Zernio, use as conexões da sua Conta Google.'] },
      { titulo: 'Conferir o que a Íris enviou', textos: ['No GT3, abra Configurações → Integrações → Íris → Últimas entregas. Nas linhas enviadas, Ver mensagem mostra o texto registrado.', 'Os avisos de tempo são separados do Aviso diário (antes Relatório diário). Os filtros e indicadores do painel descrevem somente os registros da página consultada.'] },
    ],
  },
  {
    id: 'comecar', grupo: 'Primeiros passos', titulo: 'Comece por aqui', publico: 'Para todas as pessoas',
    resumo: 'Encontre seu caminho antes de começar o trabalho.', palavrasChave: ['login', 'entrar', 'início', 'primeiro acesso', 'menu', 'celular'],
    blocos: [
      { titulo: 'Seu primeiro acesso', passos: [
        'Entre no Desk com a conta disponibilizada pela sua empresa.',
        'Confira sua identificação e os itens do menu à esquerda: Início, Conversas, Tickets, Clientes, Contratos e Íris. Ajustes e Ajuda ficam no rodapé do menu. Cada pessoa pode ver opções diferentes, conforme seus acessos e os aplicativos habilitados.',
        'Comece por Início, o painel que mostra o que pede atenção agora. Para procurar uma pessoa ou empresa específica, abra Clientes.',
        'No celular, a barra de baixo tem Início, Conversas, Tickets e Contratos. O botão Mais abre Clientes, Íris, Ajustes, Notificações, Meus pedidos de suporte, Meu perfil e Ajuda. Se uma opção não aparecer, confirme o acesso com a administração.',
        'Se você já usava o Desk antes: Conversas (antes OMNXChat), Tickets (antes Atendimento e Demandas) e Íris (antes Automações WhatsApp) mudaram de nome. Os links antigos continuam funcionando.',
      ] },
      { titulo: 'Desk ou GT3?', textos: [
        'O Desk reúne clientes, contratos, tickets, conversas de WhatsApp e ajustes da operação.',
        'O GT3 é outro ambiente de trabalho. Quando sua empresa habilita a integração, você conversa com a Íris no chat do GT3 sobre a carteira que foi associada à sua conta.',
      ], nota: 'Este manual é público. Ele não abre os dados da plataforma. Para consultar ou alterar informações, é preciso entrar no aplicativo e ter a permissão correspondente.' },
    ],
  },
  {
    id: 'acessos', grupo: 'Primeiros passos', titulo: 'Entenda seus acessos', publico: 'Equipe e administração',
    resumo: 'Ter uma conta não significa ver todos os clientes ou poder alterar tudo.', palavrasChave: ['papel', 'perfil', 'permissão', 'administrador', 'admin', 'gerente', 'estrategista', 'acesso negado'],
    blocos: [
      { titulo: 'O que muda entre as pessoas', itens: [
        'Administradores configuram os recursos que estão sob sua responsabilidade e os acessos da equipe.',
        'Gestores acompanham a operação conforme as permissões concedidas pela empresa.',
        'Estrategistas trabalham com a carteira de clientes que lhes foi atribuída.',
        'Pessoas de atendimento podem ter acesso a tickets, filas e conversas, conforme a configuração.',
      ], nota: 'O nome do perfil é uma referência. As permissões de cada recurso e a carteira autorizada também contam.' },
      { titulo: 'Uma opção não aparece ou o acesso foi recusado', passos: [
        'Confira se você está na conta e no ambiente de trabalho corretos.',
        'Informe à administração qual tela precisa usar e para realizar qual tarefa.',
        'Se o acesso já deveria estar disponível, descreva o ocorrido em Ajuda → Reportar um problema.',
      ], textos: ['Use sua própria conta. Não peça credenciais de outra pessoa para contornar uma restrição.'] },
    ],
  },
  {
    id: 'colaboradores', grupo: 'Trabalho diário', titulo: 'Colaboradores, acessos e carteiras', publico: 'Administração e responsáveis autorizados pela equipe',
    resumo: 'Cadastre a pessoa e confira separadamente o que ela pode acessar.', palavrasChave: ['colaboradores', 'ajustes', 'equipe', 'pessoa', 'cadastrar', 'perfil', 'departamento', 'controle de acesso', 'clientes vinculados', 'instância', 'carteira'],
    blocos: [
      { titulo: 'Cadastrar ou revisar um colaborador', passos: [
        'Abra Ajustes → Equipe → Colaboradores e procure a pessoa. Use os filtros de perfil e situação para conferir se o cadastro já existe.',
        'Para um novo cadastro, use Novo colaborador. Para corrigir um existente, use Editar.',
        'Confira os dados, o perfil e o departamento antes de Criar colaborador ou Salvar alterações.',
        'Reabra a edição para revisar o Controle de Acesso. Cadastrar a pessoa e atribuir sua carteira são passos diferentes.',
      ] },
      { titulo: 'Conferir a carteira e os canais de trabalho', passos: [
        'Na edição do colaborador, localize Controle de Acesso.',
        'Em Clientes vinculados, confira os clientes e o tipo de vínculo já existentes.',
        'Para uma nova atribuição autorizada, use Adicionar, escolha o cliente e selecione Atendimento ou Estrategista antes de Salvar.',
        'Revise também os números de WhatsApp (Ajustes → WhatsApp → Números e acessos) (antes Instâncias WhatsApp) e, quando disponível, Departamentos. O acesso ao cliente não deve ser confundido com o acesso ao número ou departamento que recebe suas conversas.',
      ], nota: 'Adicionar mantém os demais responsáveis. Para substituir alguém, abra o cliente e use Trocar em Responsáveis pelo cliente. A carteira operacional não altera contratos ou comissões; a associação da pessoa no GT3 continua sendo uma configuração separada.' },
      { titulo: 'Quando alguém deixa a operação', textos: [
        'As opções Inativar e Reativar aparecem conforme o acesso. Na inativação, confira a pessoa e o motivo informado antes de confirmar.',
        'Reveja também quem continuará atendendo a carteira e as conversas. A situação do colaborador, a atribuição do cliente e o responsável pela conversa são informações diferentes.',
      ] },
    ],
  },
  {
    id: 'clientes', grupo: 'Trabalho diário', titulo: 'Clientes e carteira', publico: 'Equipe autorizada',
    resumo: 'Localize o cadastro certo, confira os vínculos e evite duplicidades.', palavrasChave: ['cliente', 'cadastro', 'carteira', 'crm', 'ativo', 'inativo', 'atribuir', 'responsável', 'estrategista', 'vincular'],
    blocos: [
      { titulo: 'Encontrar e conferir um cliente', passos: [
        'Abra Clientes e procure pelo nome. Revise os filtros se a lista parecer vazia.',
        'Abra o cadastro e confira as informações que identificam o cliente antes de editar.',
        'Use as abas disponíveis para consultar contratos, conversas, tickets e os demais registros permitidos. Dentro da ficha do cliente também aparecem os tickets dele.',
        'Ao cadastrar alguém, procure primeiro para evitar criar outro registro da mesma pessoa ou empresa.',
      ] },
      { titulo: 'Cliente, equipe e contrato são coisas diferentes', textos: [
        'A carteira é o conjunto de clientes atribuídos a uma pessoa. O responsável por uma conversa é quem está atendendo aquela conversa. O contrato registra a contratação. Confira os três quando houver uma mudança de responsável.',
        'No topo do cadastro, Responsáveis pelo cliente mostra as pessoas e seus tipos de atuação. Adicionar à equipe mantém os demais vínculos. Use Trocar na pessoa atual para substituí-la ou Encerrar vínculo para retirar apenas aquele vínculo.',
        'Atendimento e Estrategista são tipos diferentes de vínculo. Confira o tipo, o motivo e a prévia antes de confirmar. Essas ações mudam a carteira operacional; não alteram contratos nem comissões.',
      ], nota: 'Deixar um cliente inativo não encerra seus contratos. Nomes ou anotações com a palavra “troca” também não substituem um vínculo de responsável.' },
    ],
  },
  {
    id: 'contratos', grupo: 'Trabalho diário', titulo: 'Contratos e suas situações', publico: 'Pessoas com acesso a contratos',
    resumo: 'Confira o contrato específico antes de mudar uma informação.', palavrasChave: ['contrato', 'status', 'situação', 'pausado', 'cancelado', 'concluído', 'inadimplente', 'não iniciado', 'associar', 'anexo', 'histórico', 'vendas novas', 'onboarding', 'quadro'],
    blocos: [
      { titulo: 'Consultar e editar', passos: [
        'Abra Contratos e encontre o registro pela lista ou pelo Quadro (antes Kanban), nas abas de Contratos.',
        'Confira o titular, o produto e o contrato selecionado. Um cliente pode ter mais de um contrato.',
        'Abra o registro para consultar os detalhes e as abas disponíveis, como anexos e histórico.',
        'Se tiver permissão para editar, revise a mudança e salve. Confira a confirmação na tela antes de considerar a tarefa concluída.',
      ] },
      { titulo: 'O que as situações comunicam', itens: [
        'Não iniciado: a operação ainda não começou.',
        'Ativo: contrato em andamento.',
        'Pausado: acompanhamento interrompido temporariamente; não equivale a cancelamento.',
        'Inadimplente: há uma pendência de pagamento indicada no contrato.',
        'Cancelado: contratação cancelada.',
        'Concluído: contratação concluída.',
      ], nota: 'Uma mudança de situação não deve ser interpretada como quitação, estorno ou encerramento de outras obrigações. Confirme os efeitos com a pessoa responsável.' },
      { titulo: 'Associar ao cadastro de cliente', textos: [
        'Quando um contrato existente ainda está sem cliente associado, a ação específica de associação permite escolher o cadastro correto. Use essa ação para corrigir o vínculo e confira o cliente escolhido.',
        'Essa associação não é um novo contrato. Se já existe um cliente associado ou houver dúvida sobre o cadastro, peça orientação antes de alterar outras informações do formulário.',
      ] },
      { titulo: 'Acompanhar o início pelas Vendas novas', textos: [
        'Em Contratos → Vendas novas (antes Onboarding), a equipe autorizada acompanha as vendas encaminhadas para início do atendimento. Use os filtros Todas, Pendente, Em atendimento, Concluída e Descartada para localizar o registro.',
        'Confira o cliente, o produto e os dados da venda antes de seguir com o atendimento. A situação da venda nova não é a mesma situação do contrato.',
      ], nota: 'Abrir uma venda pendente inicia seu atendimento na fila. Confira o registro certo antes de abrir; não use essa ação apenas para testar.' },
    ],
  },
  {
    id: 'produtos', grupo: 'Trabalho diário', titulo: 'Produtos e entregáveis', publico: 'Operação e administração autorizadas',
    resumo: 'Diferencie o catálogo de contratação dos itens que serão entregues ao cliente.', palavrasChave: ['produto', 'catálogo', 'modelo', 'documento', 'entregável', 'entrega', 'quantidade', 'portal', 'aprovação'],
    blocos: [
      { titulo: 'Catálogo de produtos dos contratos', passos: [
        'Abra Contratos → Produtos (também em Ajustes → Tickets e contratos → Produtos de contrato), quando essa aba estiver disponível para sua conta.',
        'Use Buscar produto para encontrar o nome antes de criar outro. Abra o produto para conferir os modelos de documento disponíveis.',
        'Se for necessário cadastrar um produto e você tiver autorização, preencha Nome do novo produto e use Criar.',
        'Confira o produto e o modelo correto antes de usá-los em uma contratação.',
      ], nota: 'Esse catálogo é usado nos contratos e no formulário de venda. Ele não deve ser confundido com o cadastro de entregáveis de um cliente.' },
      { titulo: 'Itens previstos para um cliente', passos: [
        'Abra o cliente e selecione a aba Produtos. Ela diferencia os produtos Em contratos dos produtos Com entregáveis.',
        'Para cadastrar um produto com entregáveis, use Adicionar produto (entregáveis), confira nome e descrição e selecione Criar produto.',
        'Abra o cartão do produto em Com entregáveis. Use Novo entregável para definir nome, tipo e quantidade e revise antes de Criar.',
        'Para acompanhar o trabalho diário, confira também os tickets do cliente em Tickets.',
      ], exemplo: 'Um produto fictício “Pacote de conteúdo” pode prever um entregável “Texto mensal”, com quantidade 2.', nota: 'O entregável descreve o que está previsto. Cadastrá-lo não significa que o conteúdo já foi produzido, aprovado ou publicado.' },
      { titulo: 'E o Portal do Cliente?', textos: [
        'O Portal do Cliente está fora dos aplicativos disponíveis no menu atual. Este guia não apresenta aprovação pelo portal como um fluxo disponível.',
        'Use as telas de Clientes e Tickets que estiverem habilitadas. Se precisar de uma área externa para aprovação, confirme com a administração qual é o processo adotado pela empresa.',
      ] },
    ],
  },
  {
    id: 'financeiro', grupo: 'Trabalho diário', titulo: 'A receber, pagamentos e comissões', publico: 'Pessoas autorizadas a consultar ou editar dados financeiros',
    resumo: 'Confira os valores de origem e diferencie previsão de recebimento confirmado.', palavrasChave: ['financeiro', 'a receber', 'recebível', 'recebíveis', 'pagamento', 'parcela', 'comissão', 'comissões', 'cobrança', 'valor', 'onboarding'],
    blocos: [
      { titulo: 'Consultar o fluxo de recebíveis', passos: [
        'Abra Contratos → A receber (antes Recebíveis), se essa opção estiver disponível para seu acesso.',
        'Pesquise o cliente e ajuste os filtros de Produto, Estrategista, Etiquetas ou Período conforme a consulta.',
        'Confira Recebimentos do dia e o detalhamento mês a mês. A tela apresenta as parcelas futuras previstas nos contratos considerados pela tela.',
        'Se houver dúvida sobre um valor ou uma data, confira o contrato de origem e sua seção Pagamentos.',
      ], nota: 'A receber é uma previsão baseada nos registros. A presença de uma parcela na tela não comprova dinheiro recebido em conta nem quitação.' },
      { titulo: 'Revisar parcelas no contrato', passos: [
        'Abra o contrato correto e localize Pagamentos. Confira data, valor, forma e plataforma de cada parcela.',
        'Se tiver autorização para corrigir o plano, use Adicionar parcela ou Puxar das vendas novas conforme a necessidade.',
        'Quando a tela apresentar uma prévia de parcelas e a opção Confirmar, confira os valores antes de confirmar e salvar o contrato.',
        'Revise o resumo financeiro após salvar. Se aparecer erro ou houver divergência, não considere a alteração concluída.',
      ] },
      { titulo: 'Comissão e cobrança têm significados próprios', textos: [
        'O contrato pode mostrar o percentual de comissão e o resumo financeiro aplicados. Confira esses dados com a pessoa responsável antes de alterar valores. Um percentual ou uma previsão não é comprovante de comissão paga.',
        'OMNX Cobrança é um módulo separado e está fora do menu atual. Este guia não apresenta réguas de cobrança, disparos ou baixa automática como operações disponíveis.',
        'Recebimento, quitação, estorno e pagamento de comissão precisam seguir o processo financeiro da empresa; não são confirmados por uma simples mudança de situação do contrato.',
      ] },
    ],
  },
  {
    id: 'chat', grupo: 'Trabalho diário', titulo: 'Conversas (antes OMNXChat)', publico: 'Equipe com acesso às Conversas',
    resumo: 'Escolha a conversa certa e diferencie atendimento de carteira.', palavrasChave: ['chat', 'conversas', 'omnxchat', 'caixa de entrada', 'inbox', 'mensagem', 'whatsapp', 'conversa', 'transferir', 'departamento', 'silenciar', 'arquivar', 'grupo', 'agenda', 'reuniões'],
    blocos: [
      { titulo: 'Antes de responder', passos: [
        'Abra Conversas (antes OMNXChat) e encontre a conversa na Caixa de entrada ou pela busca. As outras abas são Quadro, Contatos e Anotações; administradores e gerentes também veem Números e acessos.',
        'Confira o contato, se é grupo ou conversa privada e o número de WhatsApp usado na operação.',
        'Leia as mensagens recentes e confira quem está responsável por atender.',
        'Escreva a resposta e confira o resultado do envio. Se houver falha, verifique o aviso antes de repetir.',
      ] },
      { titulo: 'Transferir uma conversa', textos: [
        'As opções de departamento e responsável encaminham o atendimento daquela conversa. A opção Atribuir a estrategista, quando disponível, escolhe a pessoa que atenderá ali.',
        'Transferir a conversa não substitui a atribuição do cliente à carteira nem a revisão do responsável do contrato.',
      ] },
      { titulo: 'Tickets deste cliente, dentro da conversa', textos: [
        'Quando a conversa está ligada a um cliente, aparece um selo com os tickets dele. Abra a lista Tickets deste cliente para ver o que está em aberto e o que já foi resolvido, sem sair da conversa.',
        'Cada ticket mostra o status e leva à ficha completa. Se a conversa ainda não tiver cliente vinculado, o selo não aparece.',
      ] },
      { titulo: 'Grupos, vínculos e organização', textos: [
        'Vincular uma conversa ao cliente correto ajuda a reunir o histórico dele. Se a sugestão não estiver clara, confirme com quem conhece o relacionamento.',
        'Grupos internos da equipe e grupos de clientes têm finalidades diferentes. Confira o destino antes de enviar informações.',
        'Silenciar reduz os alertas da conversa. Arquivar organiza a caixa. Essas opções não encerram um contrato nem resolvem uma pendência comercial.',
      ] },
      { titulo: 'Agenda', textos: [
        'O item Agenda do menu abre as Reuniões marcadas pelas conversas, com o mesmo acesso de antes. É o mesmo endereço que já ficava em Ajustes → WhatsApp → Reuniões marcadas.',
      ] },
    ],
  },
  {
    id: 'atendimento', grupo: 'Trabalho diário', titulo: 'Tickets (antes Atendimento e Demandas)', publico: 'Equipe da operação',
    resumo: 'Acompanhe os pedidos dos clientes pela lista de Tickets e pelo Quadro de tickets.', palavrasChave: ['demanda', 'demandas', 'tarefa', 'atendimento', 'kanban', 'quadro', 'quadro de atendimento', 'ticket', 'chamado', 'resolvido', 'reaberto', 'aguardando', 'marcar como resolvido', 'reabrir', 'análise das conversas', 'sentimental', 'tickets', 'etapa', 'prazo', 'prioridade', 'aprovação', 'concluir', 'para confirmar', 'sugestão', 'confirmar resolução', 'manter aberto'],
    blocos: [
      { titulo: 'Criar e acompanhar um ticket', passos: [
        'Em Início, consulte o Painel para identificar o que está em aberto ou precisa de atenção.',
        'Abra Tickets para pesquisar um item ou criar um novo.',
        'Informe o cliente e os campos solicitados. Confira responsável, prazo e prioridade quando esses campos estiverem disponíveis.',
        'Abra o ticket para atualizar a etapa, registrar comentários e acompanhar a aprovação.',
        'Ao concluir, use o botão Resolver. Para reencontrar trabalhos finalizados, use o filtro Resolvidos.',
      ] },
      { titulo: 'Lista ou Quadro de tickets?', textos: [
        'A lista é útil para procurar um ticket e filtrar registros. O Quadro de tickets (antes Quadro de atendimento ou Kanban de demandas) organiza os tickets abertos por etapa, em colunas.',
        'Os nomes das etapas e algumas abas dependem da configuração da empresa. Quem administra os tickets encontra a aba Configurar, também acessível em Ajustes → Tickets e contratos → Etapas e tipos de ticket.',
      ] },
      { titulo: 'Os status de um ticket', itens: [
        'Aguardando equipe: o cliente escreveu por último no WhatsApp e falta a equipe responder.',
        'Aguardando cliente: a equipe respondeu por último e o sistema espera o cliente.',
        'Resolvido: o pedido foi atendido. Pode ter sido resolvido pela equipe ou pela Íris.',
        'Reaberto: alguém reabriu o ticket depois de resolvido, e ele ainda não foi resolvido de novo.',
        'Atrasado: o prazo venceu ou o cliente espera a equipe há 60 minutos ou mais. O tempo de espera fica âmbar a partir de 15 minutos e vermelho a partir de 60. Use o filtro Atrasados para ver só esses.',
        'Aberto e Em andamento: tickets criados à mão, sem conversa de WhatsApp ligada.',
      ], nota: 'O status é calculado pelo próprio sistema a partir da etapa do ticket e da conversa. Você muda a situação com os botões do ticket, não escolhendo o status em uma lista.' },
      { titulo: 'Tickets que nascem no WhatsApp e a resolução pela Íris', textos: [
        'Quando um cliente pede algo pelo WhatsApp, o sistema pode abrir um ticket ligado àquela conversa. Dentro do ticket, o botão Abrir no Chat leva direto para a conversa de origem.',
        'A Íris fecha o ticket sozinha só quando tem certeza: o próprio cliente confirmou, na conversa normal, que o pedido foi resolvido. Não existe código ou comando obrigatório.',
        'Quando fica em dúvida (por exemplo, só a equipe disse que resolveu, ou há mais de um pedido aberto na conversa), a Íris não fecha. O ticket continua aberto, ganha o selo Íris sugere resolver e aparece no filtro Para confirmar da lista. Na ficha, leia a conversa e clique em Confirmar resolução ou em Manter aberto.',
        'Nos tickets fechados pela Íris, a ficha mostra o motivo, a certeza da Íris e marca na conversa as mensagens que confirmaram a solução.',
      ], nota: 'Se a Íris se enganou, clique em Não resolveu na faixa da Íris (ou em Reabrir). Se você resolveu por fora, clique em Resolver. Essas ações manuais estão sempre disponíveis.' },
      { titulo: 'Ações do ticket e tickets do cliente', itens: [
        'Resolver: leva o ticket para a etapa final (resolvido por você).',
        'Assumir: aparece quando o ticket está Sem responsável; torna você o responsável.',
        'Não resolveu: na faixa "Resolvido automaticamente pela Íris", reabre o ticket quando a Íris se enganou.',
        'Confirmar resolução: na faixa "A Íris acha que este pedido foi resolvido", resolve o ticket, como o botão Resolver.',
        'Manter aberto: na mesma faixa, recusa a sugestão da Íris. O ticket continua aberto e sai do filtro Para confirmar.',
        'Reabrir: devolve um ticket resolvido para o trabalho.',
        'Abrir no Chat: abre a conversa de WhatsApp de onde o ticket nasceu.',
        'Tickets deste cliente: dentro de uma conversa (em Conversas) e na ficha do cliente (em Clientes) você vê a lista de tickets dele.',
      ] },
      { titulo: 'Análise das conversas', textos: ['A aba Análise das conversas, em Tickets, reúne a leitura de sentimento das conversas. Use os resultados como apoio e confira o contexto antes de concluir algo sobre um cliente.'] },
      { titulo: 'Conferência de uso real', textos: ['O serviço que abre tickets a partir do WhatsApp e identifica a resolução pela IA na conversa foi publicado, e a conferência com conversas reais ainda está em andamento. Antes de depender dessas automações, confirme com a administração se o uso real já foi verificado. Para comunicar um erro no sistema, use Ajuda → Reportar um problema e acompanhe em Meus pedidos de suporte.'] },
    ],
  },
  {
    id: 'aulas', grupo: 'Trabalho diário', titulo: 'Aulas da equipe', publico: 'Equipe interna; montar trilhas apenas para a administração',
    resumo: 'Estude as trilhas da equipe no seu ritmo, marque cada aula concluída e veja quanto falta.', palavrasChave: ['aulas', 'aula', 'trilha', 'trilhas', 'módulo', 'módulos', 'curso', 'treinamento', 'capacitação', 'progresso', 'estudar'],
    blocos: [
      { titulo: 'Estudar uma trilha', passos: [
        'No menu, abra Aulas, logo abaixo de Agenda.',
        'Escolha uma trilha. O cartão mostra quantos módulos e aulas ela tem e quantas você já concluiu.',
        'Use Começar ou Continuar para abrir a próxima aula que falta, ou clique em qualquer aula da lista.',
        'Depois de assistir ou ler, use Marcar como concluída. A marca verde aparece ao lado da aula e a barra de progresso avança.',
        'Use Próxima para seguir para a aula seguinte da trilha.',
      ], nota: 'O progresso que aparece é o seu. Cada pessoa vê e marca apenas as próprias aulas concluídas.' },
      { titulo: 'Montar uma trilha (administração)', passos: [
        'Em Aulas, use Nova trilha e dê um nome e, se quiser, uma descrição do que a pessoa aprende.',
        'Dentro da trilha, use Novo módulo para criar os grupos de aulas, na ordem em que devem ser estudados.',
        'Em cada módulo, use Nova aula e escolha o formato: Vídeo, Texto, PDF ou Link.',
        'Para vídeo, PDF e link, cole um endereço que comece com https://. Vídeos do YouTube e do Vimeo abrem dentro da própria aula.',
      ], nota: 'Os botões de montar aparecem só para o perfil de administração. As trilhas do portal do cliente continuam separadas e não aparecem nesta tela.' },
    ],
  },
  {
    id: 'pesquisas', grupo: 'Trabalho diário', titulo: 'Pesquisas NPS', publico: 'Administração',
    resumo: 'Crie a pesquisa de satisfação de um cliente, copie o link para ele responder e acompanhe as notas e o placar NPS.', palavrasChave: ['pesquisa', 'pesquisas', 'NPS', 'satisfação', 'campanha', 'nota', 'promotor', 'detrator', 'neutro', 'link da pesquisa'],
    blocos: [
      { titulo: 'Criar uma campanha', passos: [
        'No menu, abra Pesquisas NPS, logo abaixo de Relatórios.',
        'Use Criar campanha, busque o cliente pelo nome e escolha-o na lista.',
        'Confirme em Criar campanha. A tela da campanha abre logo em seguida, ainda sem respostas.',
        'Use Copiar link e envie o endereço ao cliente pelo canal de sempre. O Desk não manda a pesquisa sozinho pelo WhatsApp.',
      ], nota: 'Cada campanha é a pesquisa de um cliente. O link abre a pesquisa no portal do cliente; com o portal desligado, Copiar link fica indisponível e a tela avisa.' },
      { titulo: 'Ler as respostas e o placar', passos: [
        'Em Pesquisas NPS, o placar do alto soma todas as respostas: o NPS, promotores (notas 9 e 10), neutros (7 e 8) e detratores (0 a 6).',
        'A lista mostra cada campanha com o cliente, a data, a situação (Respondida ou Aguardando) e a nota.',
        'Clique numa campanha para ver as respostas dela, com nota, comentário, cliente e data.',
      ], nota: 'O NPS é a porcentagem de promotores menos a de detratores. Poucas respostas mudam muito o número: leia junto com os comentários. O relatório NPS de Relatórios continua disponível.' },
    ],
  },
  {
    id: 'relatorios', grupo: 'Trabalho diário', titulo: 'Relatórios da operação', publico: 'Administração e pessoas com acesso à área de relatórios',
    resumo: 'Escolha a pergunta, revise os filtros e só então interprete ou exporte os dados.', palavrasChave: ['relatório', 'relatórios', 'métrica', 'desempenho', 'performance', 'saúde', 'carteira', 'NPS', 'avaliação', 'trilha', 'CSV', 'PDF', 'exportar'],
    blocos: [
      { titulo: 'Encontrar a visão certa', passos: [
        'Em Ajustes → Permissões e módulos → Quem pode o quê (administradores), use Acesso rápido → Relatórios, se essa opção estiver disponível para sua conta.',
        'Escolha a aba da pergunta: Entregas por Cliente, Performance, Saúde da Carteira, NPS, Avaliações ou Trilhas.',
        'Ajuste os filtros oferecidos pela aba, como cliente, responsável, situação ou período. Confira o recorte antes de comparar resultados.',
        'Leia os registros e os indicadores em conjunto. Se não houver dados, confira os filtros e a disponibilidade dos registros antes de concluir que não houve atividade.',
      ] },
      { titulo: 'Levar uma consulta para fora do Desk', passos: [
        'Revise a aba e os filtros que deseja compartilhar.',
        'Use Exportar CSV para baixar a tabela quando a opção estiver disponível.',
        'Use Exportar PDF para abrir a impressão do navegador. Escolha salvar em PDF se essa opção existir no seu navegador.',
        'Confira o arquivo gerado antes de compartilhar, incluindo quais clientes e informações aparecem nele.',
      ], nota: 'Os relatórios da operação e a análise contextual da Íris são consultas diferentes. Uma média, uma contagem ou a falta de NPS não comprovam a satisfação atual de um cliente.' },
    ],
  },
  {
    id: 'configuracoes', grupo: 'Trabalho diário', titulo: 'Ajustes, meu perfil e notificações', publico: 'Todas as pessoas; ajustes gerais apenas para a administração',
    resumo: 'Separe suas preferências pessoais das configurações que afetam a empresa.', palavrasChave: ['configuração', 'configurações', 'ajustes', 'meu perfil', 'perfil', 'senha', 'foto', 'aparência', 'tema', 'escuro', 'notificação', 'notificações', 'mobile', 'aplicativo', 'Apps', 'permissões'],
    blocos: [
      { titulo: 'Ajustar sua experiência', passos: [
        'Abra Ajustes → Minha conta (antes Configurações) ou, no celular, Mais → Meu perfil.',
        'Em Perfil, confira os campos pessoais disponíveis e use Salvar depois de editar. A alteração de senha fica em uma área própria.',
        'Em Aparência, escolha Claro ou Escuro. Em Notificações, revise as categorias e a frequência de e-mail oferecidas pela tela.',
        'Se quiser um atalho no celular, consulte Versão Mobile e siga as instruções correspondentes ao seu dispositivo.',
      ], nota: 'Preferências de notificação não alteram a carteira nem concedem acesso a outros clientes. O recebimento de um aviso também depende de haver uma notificação aplicável.' },
      { titulo: 'Para quem administra os aplicativos', passos: [
        'Abra Ajustes → Permissões e módulos → Módulos ligados (antes Apps) para conferir os aplicativos disponíveis e seu estado na empresa.',
        'Antes de ativar ou desativar, confirme o efeito com as pessoas que usam o recurso. Leia a confirmação apresentada na tela.',
        'Para revisar quem pode usar cada recurso, abra Ajustes → Permissões e módulos → Quem pode o quê (antes Admin). Aplicativo habilitado e permissão da pessoa são coisas diferentes.',
        'Após uma mudança, confira se o menu e o acesso esperado correspondem ao trabalho da equipe.',
      ], nota: 'Desativar um aplicativo afeta o acesso da empresa a ele; não é uma preferência só sua. A tela informa que os dados são preservados. Módulos arquivados, como Cobrança e Portal, não são opções de ativação nessa lista.' },
      { titulo: 'Ajustes não confirmam uma integração pronta', textos: [
        'Em Ajustes → Empresa ficam marca, ramo e integrações, que são configurações próprias da administração. Ajustes também reúne Equipe, WhatsApp, Tickets e contratos e Suporte técnico. Se não souber o efeito de uma opção, confirme com quem responde por ela.',
        'A consulta de horários ocupados para o monitor não habilita agendamentos pela Íris. Nenhuma preferência pessoal autoriza criar, alterar ou cancelar reuniões pelo chat.',
      ] },
    ],
  },
  {
    id: 'whatsapp', grupo: 'Íris e automações', titulo: 'Aviso diário e WhatsApp', publico: 'Administração das automações',
    resumo: 'Configure destinatários, confira uma prévia e acompanhe os envios.', palavrasChave: ['automações', 'conexão', 'relatório diário', 'aviso diário', 'aviso', 'automações whatsapp', 'prévia', 'ver como fica', 'pontos de atenção', 'resumo semanal'],
    blocos: [
      { titulo: 'Configurar o Aviso diário', passos: [
        'Abra Íris (antes Automações WhatsApp). Se a área não estiver disponível, confirme sua permissão com a administração.',
        'Confira a aba Conexão e o número que será usado.',
        'Na aba Aviso diário (antes Relatório diário), revise quem recebe, o horário e o que entra no relatório.',
        'Use Ver como fica para conferir a prévia antes de ativar ou alterar o envio.',
        'Confira os avisos de configuração e acompanhe o Histórico após o horário previsto.',
      ], nota: 'O aviso diário vai para as pessoas cadastradas ou para o grupo interno configurado. Confira os destinatários; o cliente não deve receber um aviso interno por engano.' },
      { titulo: 'Leia o motivo e os limites', textos: [
        'Pontos de atenção (aba da Íris) ajudam a priorizar o acompanhamento. Confira o motivo e os registros de origem antes de decidir uma ação.',
        'Sem dados ou cobertura parcial não significa cliente satisfeito. Pode faltar conversa disponível, vínculo confirmado ou conteúdo legível.',
        'A prévia mostra como a mensagem ficaria. Ela não é comprovante de envio. O Resumo semanal é uma aba separada da Íris: confira seu próprio destino e conteúdo.',
      ] },
    ],
  },
  {
    id: 'iris', grupo: 'Íris e automações', titulo: 'Trabalhe com a Íris (antes Automações WhatsApp)', publico: 'Equipe e administração autorizadas',
    resumo: 'Peça informações com clareza e confira o resultado das ações.', palavrasChave: ['íris', 'iris', 'automações whatsapp', 'assistente', 'grupos e clientes', 'vínculos', 'vincular grupo', 'aprendizado', 'memória', 'personalidade', 'contexto', 'simulação', 'confirmar', 'resolver alerta', 'agenda'],
    blocos: [
      { titulo: 'Faça uma pergunta por vez', textos: [
        'Use o nome completo do cliente quando houver chance de confusão. Diga o que deseja consultar: contrato, conversa, pontos de atenção ou histórico.',
        'A resposta depende do acesso da pessoa e do canal. A Íris pode pedir esclarecimento ou informar que não tem dados suficientes.',
      ], exemplo: 'Íris, quais pontos de atenção aparecem para o Cliente Exemplo?', nota: 'Todos os nomes e exemplos deste guia são fictícios. Substitua-os apenas quando houver uma tarefa real e um registro corretamente identificado.' },
      { titulo: 'Ensinar uma preferência', textos: [
        'Um pedido explícito de preferência pode ser registrado para orientar respostas seguintes. Por exemplo, você pode pedir respostas mais curtas. Isso não é treinamento automático a cada mensagem.',
        'Na área Íris, a administração encontra Personalidade e contexto e Memória e aprendizados. As demais abas são Pontos de atenção, Tempo de resposta, Aviso diário, Resumo semanal, Reuniões, Histórico, Conexão e Primeiros passos. Para ligar grupos e conversas aos clientes, use Clientes → Grupos e clientes. Confira os registros e use as opções disponíveis para revisar ou desativar uma preferência.',
        'Uma preferência não cria permissão, não substitui os dados atuais e não habilita uma integração.',
      ], exemplo: 'Íris, prefiro respostas em frases curtas, com os pontos principais primeiro.' },
      { titulo: 'Informar que um alerta foi resolvido', textos: [
        'No grupo interno autorizado, declare claramente o cliente e qual problema foi resolvido. A Íris confere se consegue identificar o alerta e se a operação é permitida.',
        'Leia o resultado. Registrar um alerta como resolvido não cancela contrato nem altera o cadastro. Uma nova ocorrência pode voltar a pedir atenção.',
      ], exemplo: 'Íris, o alerta de espera de resposta do Cliente Exemplo já foi resolvido por telefone.' },
      { titulo: 'Alterações com prévia e confirmação', textos: [
        'No grupo interno autorizado e com as permissões necessárias, a Íris pode preparar a ativação ou inativação de um cliente e a associação de um contrato ainda sem cliente ao cadastro correto.',
        'Primeiro ela apresenta uma prévia. Leia o antes e o depois. Para executar, a mesma pessoa envia outra mensagem no mesmo grupo com o código recebido, dentro do prazo informado.',
        'Aguarde o recibo da operação. Se o código expirar, o estado mudar ou houver recusa, peça uma nova prévia. Inativar um cliente com contrato vigente é recusado.',
      ], nota: 'No painel, Simular pergunta serve para conferir uma resposta sem enviar WhatsApp ou executar essas alterações. Simulação e prévia não são confirmação de escrita.' },
      { titulo: 'Limites importantes', itens: [
        'A Íris não agenda reuniões pelo chat. Conectar a agenda para descontar horários ocupados no monitor não habilita agendamento.',
        'Uma análise de satisfação pode ser indeterminada. Ausência de mensagens não prova que está tudo bem.',
        'A Íris não envia uma mensagem ao cliente só porque você pediu em uma consulta.',
        'Trocar estrategista, confirmar vínculo de grupo ou mudar a situação de um contrato pelo chat não faz parte das duas alterações com confirmação descritas acima.',
      ] },
    ],
  },
  {
    id: 'gt3', grupo: 'Íris e automações', titulo: 'Íris no GT3: pessoas e carteiras', publico: 'Administração e estrategistas',
    resumo: 'A conexão do ambiente e a associação de cada pessoa são passos diferentes.', palavrasChave: ['gt3', 'workspace', 'integração', 'associação', 'associar', 'administrador', 'carteira', 'teste', 'privado', 'dm'],
    blocos: [
      { titulo: 'Para quem administra', passos: [
        'No GT3, abra Configurações → Integrações → Íris.',
        'Se ainda não houver conexão, siga a autorização pelo Desk com a pessoa que administra as automações. Volte ao GT3 para concluir a conexão.',
        'Em Pessoas e carteiras autorizadas, escolha a pessoa do GT3 e o estrategista correspondente no Desk. Essa associação deve ser explícita; nomes parecidos não confirmam identidade.',
        'Revise a carteira exibida, o estado do acesso e a opção de modo teste. Salve a associação.',
        'Confira horário, dias, tipos de aviso e ativação da integração. A conexão começa pausada; conectar não significa começar a enviar.',
      ], nota: 'Administrar o GT3 não concede visão geral dos dados do Desk à Íris. Cada conversa continua limitada à carteira da associação. Alterar responsáveis no Desk não associa automaticamente outra pessoa do GT3. Quando for preciso criar ou mudar essa associação, o dono ou a administração autorizada deve conferir e salvar no GT3.' },
      { titulo: 'Para quem é estrategista', passos: [
        'Confira se a administração já associou sua conta à carteira correta.',
        'Use Conversar com Íris, quando disponível, para abrir sua conversa privada.',
        'Peça um relatório da sua carteira ou pergunte por um cliente que faz parte dela.',
        'Se a carteira estiver errada ou faltar alguém, peça à administração para revisar as atribuições no Desk e a associação no GT3.',
      ], exemplo: 'Me mostre um relatório dos meus clientes, com pontos de atenção e limites da análise.' },
      { titulo: 'Teste, pausa e mudança de associação', textos: [
        'O teste do painel é enviado somente à própria conta autenticada, com associação ativa em modo teste e integração ativa. Não é um disparo para toda a equipe.',
        'Pausar a integração impede novas respostas e avisos. Pausar uma pessoa ou mudar sua associação pode retirar o acesso à conversa antiga; use a conversa atual disponibilizada pela integração.',
        'A conversa de carteira no GT3 é de consulta. As alterações de cadastro pelo grupo interno do WhatsApp não ficam disponíveis nesse canal.',
      ] },
    ],
  },
  {
    id: 'entregas', grupo: 'Íris e automações', titulo: 'Acompanhe os avisos enviados', publico: 'Administração do GT3',
    resumo: 'Leia o estado atual da entrega antes de tentar enviar de novo.', palavrasChave: ['monitor', 'entrega', 'últimas 30', 'atualizar', 'retry', 'nova tentativa', 'falhou', 'processando', 'enviado', 'cancelado', 'sem alertas'],
    blocos: [
      { titulo: 'Onde conferir', passos: [
        'No GT3, abra Configurações → Integrações → Íris.',
        'Consulte Últimas entregas. A lista reúne os 30 registros mais recentes do ambiente.',
        'Confira a pessoa, o tipo e o resultado. Aviso diário, teste e resposta são tipos diferentes.',
        'Nas linhas com resultado Enviado, clique em Ver mensagem para ler o texto daquela entrega.',
        'Use Fechar para voltar à lista. Ver mensagem é apenas uma consulta: não reenvia e não abre a conversa privada inteira.',
        'Use Atualizar para buscar o estado mais recente. Atualizar a lista não reenvia a mensagem.',
      ] },
      { titulo: 'Como interpretar o resultado', itens: [
        'Processando: a preparação ainda está em andamento. Aguarde e atualize a lista.',
        'Enviado: o envio foi registrado. A pessoa pode conferir sua conversa com a Íris.',
        'Sem alertas · envio dispensado: não houve mensagem de aviso a enviar nessa execução. Isso não é garantia de cobertura completa ou satisfação positiva.',
        'Falhou: a tentativa não terminou com sucesso. Consulte novamente antes de considerar o resultado definitivo.',
        'Cancelado: a entrega foi cancelada. Confira com a administração se houve pausa ou mudança de acesso.',
      ] },
      { titulo: 'O que aparece em Ver mensagem', textos: [
        'O texto é o que foi registrado naquela entrega, com suas quebras de linha. Ele não é um relatório novo gerado na hora.',
        'Se a mensagem foi removida, editada ou não pôde ser conferida, a tela informa que ela está indisponível. Uma falha de consulta mostra erro e permite Tentar novamente, sem reenviar.',
        'A consulta é restrita à administração do workspace. Ter acesso ao monitor não adiciona você às conversas privadas das outras pessoas.',
      ] },
      { titulo: 'Uma falha pode ter nova tentativa', textos: [
        'Avisos diários podem passar por nova tentativa automática. Um registro que apareceu como Falhou pode depois aparecer como Enviado. Aguarde e use Atualizar para acompanhar.',
        'Evite repetir vários testes enquanto houver processamento. Se a falha persistir, registre o horário aproximado, o tipo e o resultado exibido e reporte o problema.',
        'Confira também se a integração e a pessoa estão ativas e se o horário e os dias de envio foram configurados como esperado.',
      ], nota: 'Últimas entregas mostra um recorte recente. Não é uma consulta de todo o histórico desde o início da integração.' },
    ],
  },
  {
    id: 'responsaveis', grupo: 'Trabalho diário', titulo: 'Responsáveis: adicionar, trocar e encerrar', publico: 'Pessoas com permissão para gerenciar responsáveis',
    resumo: 'Mude a equipe do cliente com motivo, prévia e histórico, sem alterar contratos ou comissões.', palavrasChave: ['troca', 'trocar', 'substituir', 'estrategista', 'atendimento', 'histórico', 'responsáveis', 'encerrar', 'equipe'],
    blocos: [
      { titulo: 'Onde começar', passos: [
        'Abra Clientes e encontre o cadastro correto.',
        'Abra o cliente e localize Responsáveis pelo cliente no topo da página.',
        'Confira cada pessoa e seu tipo de vínculo: Estrategista ou Atendimento. Se houver mais de uma pessoa, escolha exatamente qual vínculo deseja mudar.',
      ], nota: 'Os botões dependem da sua permissão e do acesso ao cliente. Se não aparecerem, peça à administração para conferir. O perfil da conta e o tipo do vínculo são diferentes: uma pessoa administradora também pode acompanhar clientes como Estrategista.' },
      { titulo: 'Adicionar à equipe', passos: [
        'Use Adicionar à equipe para incluir outra pessoa sem substituir quem já está no cliente.',
        'Confira a Função no cliente e escolha uma Pessoa da equipe entre as opções disponíveis.',
        'Preencha o Motivo da alteração e use Revisar alteração.',
        'Leia o cliente, a pessoa, o tipo e os efeitos da prévia. Se estiver correto, use Confirmar alteração e aguarde a confirmação na tela.',
      ], nota: 'Adicionar mantém os demais responsáveis. Para substituir uma pessoa, use Trocar no vínculo atual.' },
      { titulo: 'Trocar um responsável atual', passos: [
        'Em Responsáveis pelo cliente, encontre a pessoa que será substituída e use Trocar nessa pessoa.',
        'Escolha o Novo responsável entre as pessoas disponíveis. O tipo do vínculo selecionado é mantido.',
        'Escreva o Motivo da alteração e use Revisar alteração.',
        'Confira o nome anterior, o novo nome e o cliente na prévia. Use Confirmar alteração quando tudo estiver correto.',
        'Aguarde a confirmação e confira a equipe atual e o Histórico de responsáveis. Os demais vínculos do cliente são mantidos.',
      ], nota: 'A troca encerra o vínculo selecionado e cria ou reativa o novo na mesma alteração. Ela não muda o responsável dos contratos nem recalcula comissões.' },
      { titulo: 'Encerrar um vínculo', passos: [
        'Encontre a pessoa e o tipo corretos em Responsáveis pelo cliente e use Encerrar vínculo.',
        'Informe o motivo e use Revisar alteração.',
        'Confira quem sairá da equipe atual antes de usar Confirmar alteração.',
        'Aguarde a confirmação e confira o histórico. O vínculo sai da equipe atual; o registro dessa alteração é preservado.',
      ], nota: 'Encerrar vínculo não inativa a conta da pessoa, não encerra contratos e não remove os outros responsáveis do cliente. A carteira da Íris usa os vínculos atuais de Estrategista.' },
      { titulo: 'Consultar o histórico e tratar uma recusa', passos: [
        'Abra Histórico de responsáveis no mesmo cartão.',
        'Confira a pessoa anterior e a nova, a data, quem realizou a alteração e o motivo. Use Carregar alterações anteriores para consultar mais registros.',
        'Se a tela informar que os dados mudaram ou que o acesso não permite a ação, use Atualizar dados. Confira a nova situação e prepare a alteração novamente.',
      ], nota: 'O histórico registra as alterações feitas por esse fluxo e por outros fluxos da plataforma a partir da atualização. Não reconstrói trocas antigas nem inventa datas. Não renomeie o cliente para representar uma troca de responsável.' },
      { titulo: 'Conferir a carteira no GT3', textos: [
        'A mudança de responsáveis no Desk e a associação de uma pessoa no GT3 são passos separados. Alterar o vínculo do cliente não cria uma conexão nem associa automaticamente uma conta do GT3.',
        'Se a pessoa ainda não estiver associada ou a associação precisar mudar, o dono ou a administração autorizada deve abrir Configurações → Integrações → Íris no GT3, conferir Pessoas e carteiras autorizadas e salvar a associação correta. Uma associação já existente continua usando a carteira autorizada do estrategista associado.',
      ] },
    ],
  },
  {
    id: 'ajuda', grupo: 'Para consultar', titulo: 'Ajuda e Perguntar à Íris', publico: 'Equipe autenticada',
    resumo: 'Tire dúvidas de uso e encontre instruções no manual sem sair do seu trabalho.', palavrasChave: ['ajuda', 'chatbot', 'tutorial', 'manual', 'iris', 'pergunta', 'como usar'],
    blocos: [
      { titulo: 'Perguntar e conferir as fontes', passos: ['Clique em Ajuda: no computador, ela fica no rodapé do menu e como botão no canto inferior; em Conversas, fica no topo; no celular, use Mais → Ajuda. Depois escolha Perguntar à Íris.', 'Escreva a tarefa que deseja aprender ou escolha uma pergunta sugerida.', 'Confira a orientação e abra as fontes do manual para ler os passos completos. Os botões que levam até a tela (por exemplo, Abrir Tickets) dependem dos seus acessos e dos aplicativos habilitados.'], nota: 'A ajuda explica o uso da plataforma. Não consulta dados de clientes, não altera cadastros e não executa ações. A Íris operacional do WhatsApp e do GT3 tem outro fluxo.' },
      { titulo: 'Sua conversa e a disponibilidade da IA', textos: ['A pergunta e as mensagens recentes desta conversa podem ser enviadas ao provedor de IA já configurado pela empresa. Não inclua dados de clientes, senhas ou informações pessoais.', 'O histórico fica apenas na memória desta sessão. Use Limpar conversa para apagá-lo. Ao trocar de conta ou empresa, a conversa é reiniciada.', 'Quando a IA estiver indisponível ou não houver uma orientação suficiente, a ajuda oferece uma consulta local do manual, identificada na tela. Essa consulta não é uma resposta gerada por IA. O menu Ajuda também tem Reportar um problema, Abrir o manual, Meus pedidos de suporte e Segurança, privacidade e IA.'] },
    ],
  },
  {
    id: 'suporte', grupo: 'Para consultar', titulo: 'Reporte um problema', publico: 'Todas as pessoas com acesso ao Desk',
    resumo: 'Um relato claro ajuda a equipe a encontrar o que aconteceu.', palavrasChave: ['suporte', 'meus pedidos de suporte', 'meus reportes', 'ajuda', 'erro', 'bug', 'problema', 'reporte', 'protocolo', 'captura', 'anexo'],
    blocos: [
      { titulo: 'Como enviar um relato útil', passos: [
        'No aplicativo, clique em Ajuda → Reportar um problema (no celular: Mais → Ajuda).',
        'Escolha a categoria e escreva um título que identifique a tarefa.',
        'Conte o que tentou fazer, o que esperava e o que aconteceu. Informe o horário aproximado e se conseguiu repetir o problema.',
        'Revise a captura e os anexos antes de enviar. Remova o que não for necessário e nunca inclua senhas ou códigos de acesso.',
        'Depois de enviar, acompanhe o protocolo em Meus pedidos de suporte (Ajuda → Meus pedidos de suporte, ou Mais no celular).',
      ], exemplo: 'Título: não consegui salvar um ticket. Relato: abri o ticket de exemplo, alterei o prazo e cliquei em Salvar. Esperava ver a nova data, mas apareceu uma mensagem de erro.' },
      { titulo: 'Enquanto aguarda', textos: [
        'Confira se a operação já foi concluída antes de repeti-la. Se a ação envolve mensagem, contrato ou cadastro, repetir por impulso pode dificultar a conferência.',
        'Se você não consegue entrar no aplicativo, procure a pessoa responsável pelo seu acesso na empresa.',
      ] },
    ],
  },
  {
    id: 'perguntas', grupo: 'Para consultar', titulo: 'Perguntas frequentes', publico: 'Respostas rápidas',
    resumo: 'As dúvidas mais comuns em um só lugar.', palavrasChave: ['faq', 'dúvidas', 'perguntas', 'respostas', 'nomes antigos', 'omnxchat', 'demandas', 'automações whatsapp', 'onboarding', 'recebíveis', 'kanban'], blocos: [],
    perguntas: [
      { pergunta: 'O manual abre os clientes da minha empresa?', resposta: 'Não. Este é um guia público e estático. Os dados continuam dentro dos aplicativos e dependem de login e permissão.' },
      { pergunta: 'A Íris fecha tickets sozinha?', resposta: 'Só depois que o cliente confirma, na conversa, que o pedido foi resolvido. Se a Íris se enganou, abra o ticket e clique em Não resolveu (ou Reabrir); para fechar por conta própria, use Resolver.' },
      { pergunta: 'Os nomes das telas mudaram: onde estão as telas antigas?', resposta: 'Agora são Conversas (antes OMNXChat), Tickets (antes Atendimento e Demandas) e Íris (antes Automações WhatsApp). Os links e favoritos antigos continuam funcionando e levam para a tela nova.' },
      { pergunta: 'Por que meu menu é diferente do de um colega?', resposta: 'Aplicativos habilitados, permissões e carteira podem ser diferentes. Se faltar uma opção necessária ao seu trabalho, confirme com a administração.' },
      { pergunta: 'Adicionar à equipe troca o estrategista anterior?', resposta: 'Não. Adicionar mantém os demais vínculos. Para substituir alguém, abra o cliente, encontre a pessoa em Responsáveis pelo cliente e use Trocar. Confira a prévia e confirme a alteração.' },
      { pergunta: 'Trocar o responsável do cliente muda contratos ou comissões?', resposta: 'Não. Adicionar, trocar ou encerrar um vínculo altera a carteira operacional. O responsável contratual e as comissões são informações separadas e não são alterados por essas ações.' },
      { pergunta: 'Uma pessoa administradora pode ser estrategista de um cliente?', resposta: 'Sim. O perfil da conta e o tipo do vínculo são diferentes. Uma pessoa elegível pode ter um vínculo de Estrategista no cliente mesmo que seu perfil seja de administração.' },
      { pergunta: 'Transferir a conversa muda a carteira do cliente?', resposta: 'Não. O responsável por uma conversa e a atribuição do cliente são informações diferentes. Uma transferência encaminha aquele atendimento.' },
      { pergunta: 'A tela A receber confirma que o cliente já pagou?', resposta: 'Não. É uma visão de parcelas previstas a partir dos registros. O recebimento deve ser conferido pelo processo financeiro da empresa.' },
      { pergunta: 'Onde estão Cobrança e Portal do Cliente?', resposta: 'Esses módulos estão fora dos aplicativos disponíveis no menu atual. Consulte as opções habilitadas e confirme com a administração qual processo a empresa usa.' },
      { pergunta: 'Sem dados quer dizer que o cliente está satisfeito?', resposta: 'Não. Pode faltar histórico, vínculo ou conteúdo suficiente para uma avaliação. O resultado deve continuar indeterminado até haver evidência.' },
      { pergunta: 'A Íris aprende tudo o que eu escrevo?', resposta: 'Não existe treinamento automático a cada mensagem. Preferências explícitas podem ser registradas; a administração pode revisar os aprendizados disponíveis.' },
      { pergunta: 'Posso pedir que a Íris marque uma reunião?', resposta: 'Não. A conexão de agenda do monitor consulta disponibilidade e não habilita a Íris a agendar reuniões pelo chat.' },
      { pergunta: 'Falhou no Aviso diário: devo clicar várias vezes?', resposta: 'Aguarde e use Atualizar. Pode haver uma nova tentativa automática. Atualizar consulta o resultado; não dispara novamente. Se persistir, reporte.' },
      { pergunta: 'A prévia já mudou meu cadastro?', resposta: 'Não. Na tela de responsáveis, confira o antes e o depois e use Confirmar alteração para executar. Nas ações da Íris pelo grupo interno do WhatsApp, a confirmação exige outra mensagem com o código. Aguarde a confirmação do resultado em cada canal.' },
      { pergunta: 'Posso consultar a carteira de um colega pelo GT3?', resposta: 'A Íris no GT3 usa somente a carteira da associação da sua conta. Ser administrador do GT3 não transforma a conversa em acesso geral ao Desk.' },
    ],
  },
  {
    id: 'glossario', grupo: 'Para consultar', titulo: 'Glossário sem complicação', publico: 'Para consultar quando precisar',
    resumo: 'O significado dos termos usados ao longo deste guia.', palavrasChave: ['glossário', 'termos', 'significado', 'o que é'], blocos: [],
    termos: [
      { termo: 'Carteira', definicao: 'Conjunto de clientes atribuídos a uma pessoa para acompanhar.' },
      { termo: 'Vínculo', definicao: 'Associação entre registros, como pessoa e cliente ou conversa e cadastro.' },
      { termo: 'Estrategista', definicao: 'Pessoa responsável pelo acompanhamento dos clientes que lhe foram atribuídos.' },
      { termo: 'Responsável pela conversa', definicao: 'Pessoa que atende uma conversa específica. Não é, por isso só, responsável pela carteira ou pelo contrato.' },
      { termo: 'Ticket', definicao: 'Pedido de um cliente registrado para acompanhamento até ser resolvido (antes chamado de demanda).' },
      { termo: 'Catálogo de produtos', definicao: 'Lista dos produtos usados nas contratações e no formulário de venda.' },
      { termo: 'Entregável', definicao: 'Item previsto no produto de um cliente, como um texto, uma arte ou um vídeo. Não é, por si só, uma entrega concluída.' },
      { termo: 'Vendas novas', definicao: 'Vendas que chegaram à operação e ainda precisam virar contrato e começar o atendimento (antes chamada Onboarding).' },
      { termo: 'A receber', definicao: 'Valor com previsão de recebimento (antes Recebíveis). Previsão e recebimento confirmado são informações diferentes.' },
      { termo: 'Comissão', definicao: 'Remuneração relacionada à contratação conforme as regras aplicáveis. O percentual no cadastro não comprova pagamento.' },
      { termo: 'NPS', definicao: 'Pesquisa de recomendação respondida pelo cliente. Uma nota é um sinal específico; não substitui todo o contexto do relacionamento.' },
      { termo: 'Quadro', definicao: 'Visão dos itens em colunas, uma para cada etapa do fluxo (antes chamado Kanban).' },
      { termo: 'Íris', definicao: 'A assistente de IA do Desk: a área Íris (antes Automações WhatsApp) e a ajuda Perguntar à Íris.' },
      { termo: 'Prévia', definicao: 'Apresentação de como uma mensagem ou alteração ficaria antes de executar.' },
      { termo: 'Simulação', definicao: 'Conferência de um comportamento sem executar a alteração ou enviar a mensagem prevista.' },
      { termo: 'Recibo', definicao: 'Confirmação do resultado de uma operação. Uma intenção ou uma prévia não substitui o recibo.' },
      { termo: 'Cobertura parcial', definicao: 'A consulta não conseguiu observar todas as informações necessárias. O relatório deve informar essa limitação.' },
      { termo: 'Indeterminado', definicao: 'Não há evidência suficiente para chegar a uma conclusão.' },
      { termo: 'Workspace', definicao: 'Ambiente de trabalho de uma equipe no GT3.' },
      { termo: 'DM', definicao: 'Conversa privada entre a pessoa e a Íris no GT3.' },
      { termo: 'Modo teste', definicao: 'Opção da associação usada para conferir o aviso na própria conta autorizada antes de ampliar o uso.' },
    ],
  },
]

/** Busca apenas no conteúdo público em memória; não lê URL, sessão ou rede. */
export function normalizarBuscaManual(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim()
}
export function buscarSecoesManual(busca: string): readonly SecaoManual[] {
  const termos = normalizarBuscaManual(busca.slice(0, 160)).split(' ').filter(Boolean)
  if (!termos.length) return SECOES_MANUAL
  return SECOES_MANUAL.filter((s) => {
    const texto = normalizarBuscaManual([
      s.titulo, s.resumo, s.publico, s.grupo, ...s.palavrasChave,
      ...s.blocos.flatMap((b) => [b.titulo, ...(b.textos ?? []), ...(b.passos ?? []), ...(b.itens ?? []), b.exemplo ?? '', b.nota ?? '']),
      ...(s.perguntas ?? []).flatMap((p) => [p.pergunta, p.resposta]),
      ...(s.termos ?? []).flatMap((t) => [t.termo, t.definicao]),
    ].join(' '))
    return termos.every((termo) => texto.includes(termo))
  })
}
