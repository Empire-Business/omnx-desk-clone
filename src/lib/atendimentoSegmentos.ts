/**
 * Segmentos do app Atendimento.
 *
 * O mesmo app serve ramos diferentes. Uma agência de social media trabalha com
 * peças que passam por aprovação do cliente; uma clínica trabalha com pacientes
 * e retorno; um escritório, com processos e prazos. O que muda entre eles não é
 * o motor — é o **vocabulário**, as **abas** e as **métricas** que importam.
 *
 * Este arquivo é o catálogo desses ramos. Cada empresa tem um segmento
 * (`tenants.atendimento_segmento`), e a interface inteira se adapta a partir
 * daqui — não há `if (segmento === 'clinica')` espalhado pelas telas.
 *
 * Para acrescentar um ramo novo: adicione a entrada aqui e o valor no CHECK da
 * coluna (migration `20260804180000`). Nada mais precisa mudar.
 */

/** Métricas que o painel sabe calcular. Cada segmento escolhe as suas. */
export type ChaveMetrica =
  | 'atrasadas'
  | 'venceHoje'
  | 'venceEstaSemana'
  | 'abertas'
  | 'aguardandoAprovacao'
  | 'comAjustes'
  | 'concluidasNoMes'

export type ChaveAba = 'painel' | 'demandas' | 'kanban' | 'sentimento' | 'config'

export interface Segmento {
  chave: string
  /** Nome do ramo, como aparece na tela de configuração. */
  nome: string
  descricao: string
  /** Como o app se chama no menu e no título desta empresa. */
  rotuloApp: string
  /** Como se chama uma unidade de trabalho. Singular e plural. */
  rotuloItem: string
  rotuloItens: string
  /** Como se chama a pessoa/empresa atendida. */
  rotuloCliente: string
  /** Texto da ação principal. Botão genérico não diz o que faz. */
  acaoNovo: string
  /** Prefixo do código legível (DEM-00001). */
  prefixoCodigo: string
  abas: ChaveAba[]
  metricas: ChaveMetrica[]
  /** Frase do estado vazio — é onde a pessoa entende para que serve o app. */
  textoVazio: string
  /** Sugestões semeadas no banco quando a empresa adota o segmento. */
  tipos: string[]
  etapas: Array<{ nome: string; cor: string; final?: boolean }>
}

export const SEGMENTOS: Record<string, Segmento> = {
  social_media: {
    chave: 'social_media',
    nome: 'Social Media',
    descricao: 'Agências e times que produzem conteúdo para redes sociais.',
    rotuloApp: 'Atendimento',
    rotuloItem: 'demanda',
    rotuloItens: 'demandas',
    rotuloCliente: 'cliente',
    acaoNovo: 'Nova demanda',
    prefixoCodigo: 'DEM',
    abas: ['painel', 'demandas', 'kanban', 'sentimento', 'config'],
    // Aprovação do cliente é o gargalo do ramo: peça pronta parada esperando
    // resposta é o que mais atrasa entrega.
    metricas: [
      'atrasadas', 'venceHoje', 'venceEstaSemana', 'abertas',
      'aguardandoAprovacao', 'comAjustes', 'concluidasNoMes',
    ],
    textoVazio:
      'Toda vez que um cliente pedir alguma coisa — um reels, um carrossel, um ajuste — registre aqui. É o que faz o pedido parar de se perder na conversa do WhatsApp.',
    tipos: ['Reels', 'Carrossel', 'Story', 'Post único', 'Campanha', 'Outro'],
    etapas: [
      { nome: 'Solicitado', cor: 'slate' },
      { nome: 'Em produção', cor: 'blue' },
      { nome: 'Em revisão interna', cor: 'amber' },
      { nome: 'Aguardando aprovação', cor: 'violet' },
      { nome: 'Aprovado', cor: 'emerald' },
      { nome: 'Publicado', cor: 'green', final: true },
    ],
  },

  clinica: {
    chave: 'clinica',
    nome: 'Clínica',
    descricao: 'Clínicas e consultórios que acompanham pacientes e retornos.',
    rotuloApp: 'Atendimentos',
    rotuloItem: 'atendimento',
    rotuloItens: 'atendimentos',
    rotuloCliente: 'paciente',
    acaoNovo: 'Novo atendimento',
    prefixoCodigo: 'ATD',
    // Sem kanban: o fluxo da clínica é curto e a lista com filtro dá conta.
    // Aba a mais é aba que ninguém abre.
    abas: ['painel', 'demandas', 'sentimento', 'config'],
    // Não há "aprovação do cliente" aqui — paciente não aprova peça.
    metricas: ['atrasadas', 'venceHoje', 'venceEstaSemana', 'abertas', 'concluidasNoMes'],
    textoVazio:
      'Registre aqui cada atendimento e retorno de paciente, com o profissional responsável e a data combinada.',
    tipos: ['Primeira consulta', 'Retorno', 'Exame', 'Procedimento', 'Outro'],
    etapas: [
      { nome: 'Agendado', cor: 'slate' },
      { nome: 'Em atendimento', cor: 'blue' },
      { nome: 'Aguardando exame', cor: 'amber' },
      { nome: 'Concluído', cor: 'green', final: true },
    ],
  },

  escritorio: {
    chave: 'escritorio',
    nome: 'Escritório',
    descricao: 'Escritórios e consultorias que tocam processos e demandas de prazo.',
    rotuloApp: 'Demandas',
    rotuloItem: 'demanda',
    rotuloItens: 'demandas',
    rotuloCliente: 'cliente',
    acaoNovo: 'Nova demanda',
    prefixoCodigo: 'DEM',
    abas: ['painel', 'demandas', 'kanban', 'sentimento', 'config'],
    // Prazo é o que manda no ramo — por isso as três métricas de prazo primeiro.
    metricas: ['atrasadas', 'venceHoje', 'venceEstaSemana', 'abertas', 'concluidasNoMes'],
    textoVazio:
      'Registre aqui cada demanda do cliente, com responsável e prazo. É o que evita descobrir um vencimento no dia.',
    tipos: ['Petição', 'Parecer', 'Reunião', 'Diligência', 'Outro'],
    etapas: [
      { nome: 'Recebida', cor: 'slate' },
      { nome: 'Em elaboração', cor: 'blue' },
      { nome: 'Em revisão', cor: 'amber' },
      { nome: 'Aguardando cliente', cor: 'violet' },
      { nome: 'Concluída', cor: 'green', final: true },
    ],
  },
}

/** Segmento padrão de quem ainda não escolheu — e rede de segurança para valor desconhecido. */
export const SEGMENTO_PADRAO = SEGMENTOS.social_media

export function segmentoDe(chave: string | null | undefined): Segmento {
  return (chave && SEGMENTOS[chave]) || SEGMENTO_PADRAO
}

export const LISTA_SEGMENTOS = Object.values(SEGMENTOS)

/** Rótulos das métricas — o texto do card no painel. */
export const ROTULO_METRICA: Record<ChaveMetrica, string> = {
  atrasadas: 'Atrasadas',
  venceHoje: 'Vencem hoje',
  venceEstaSemana: 'Vencem em 7 dias',
  abertas: 'Em aberto',
  aguardandoAprovacao: 'Esperando o cliente',
  comAjustes: 'Cliente pediu ajustes',
  concluidasNoMes: 'Concluídas no mês',
}
