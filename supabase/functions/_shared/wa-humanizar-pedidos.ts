// Pedidos de humanização (ver ./wa-humanizar.ts) das mensagens curtas da UAZAPI:
// teste de envio e link da reunião. O relatório diário monta o dele em
// ./wa-relatorio.ts e o resumo semanal em wa-auto-resumo-semanal/regras.ts.
//
// Tudo aqui é PURO e só usa texto escrito no código + os fatos (nome, data, hora,
// link) — o fallback nunca usa texto livre de fora.
import { cumprimento, saudacoesPara, type PedidoHumanizacao, type PeriodoDia } from './wa-humanizar.ts'

/** Texto de sempre do teste (base para a IA). */
export const TEXTO_TESTE =
  'Mensagem de teste das Automações WhatsApp. Se você recebeu, a conexão está funcionando.'

/** "Enviar mensagem de teste" (aba Conexão) — quem recebe é o próprio admin. */
export function pedidoTeste(periodo: PeriodoDia): PedidoHumanizacao {
  const c = cumprimento(periodo)
  return {
    tipo: 'teste',
    textoBase: TEXTO_TESTE,
    fatos: [],
    padroesObrigatorios: [/teste/i],
    tom: 'gestor-interno',
    canal: 'privado',
    periodo,
    contexto: 'mensagem de teste para confirmar que a conexão do WhatsApp das Automações está funcionando',
    instrucoesExtras: ['Deixe claro que é um TESTE e que, se chegou, a conexão está funcionando.'],
    variantes: {
      saudacoes: ['Oi!', 'Olá!', 'Oi, tudo bem?', `${c}!`, ''],
      aberturas: [''],
      blocos: [[
        'Mensagem de teste das Automações WhatsApp. Se você recebeu, a conexão está funcionando.',
        'Este é um teste das Automações WhatsApp. Se chegou aí, está tudo conectado.',
        'Só testando a conexão das Automações WhatsApp: se esta mensagem chegou, está funcionando.',
        'Teste rápido das Automações WhatsApp. Se você está lendo isto, a conexão funciona.',
        'Passando para testar as Automações WhatsApp. Recebeu? Então a conexão está ok.',
      ]],
      fechos: ['', '', 'Não precisa responder.', 'Pode ignorar esta mensagem.'],
    },
  }
}

export interface DadosLinkReuniao {
  /** Texto de sempre (MODELO_LINK renderizado em wa-auto-agendar). */
  textoBase: string
  cliente: string
  /** "26/10/2026" */
  data: string
  /** "14:30" */
  hora: string
  link: string
  periodo: PeriodoDia
}

/**
 * Link da reunião no grupo do cliente (etapa 2 do agendamento).
 * Data e hora vão JUNTAS num marcador só ([DATA_HORA] = "26/10/2026 às 14:30"): com
 * dois marcadores a IA poderia inverter ("ficou para 14:30, às 26/10/2026"). Se o
 * texto base não tiver "data às hora", mascarar() devolve null e sai o fallback.
 */
export function pedidoLinkReuniao(d: DadosLinkReuniao): PedidoHumanizacao {
  const { cliente, link } = d
  const quando = `${d.data} às ${d.hora}`
  return {
    tipo: 'agendamento_link',
    textoBase: d.textoBase,
    fatos: [
      { valor: cliente, marcador: 'CLIENTE' },
      { valor: quando, marcador: 'DATA_HORA' },
      { valor: link, marcador: 'LINK' },
    ],
    tom: 'cliente',
    canal: 'grupo',
    periodo: d.periodo,
    contexto: 'envio do link de uma reunião já marcada com o cliente, no grupo de WhatsApp dele',
    instrucoesExtras: ['Cite o nome do cliente ([CLIENTE]) e a data e o horário da reunião ([DATA_HORA]).'],
    variantes: {
      saudacoes: saudacoesPara(cliente, d.periodo),
      aberturas: [
        `Segue o link da nossa reunião de ${quando}:`,
        `Nossa reunião ficou para ${quando}. Para entrar, é só usar este link:`,
        `Para a reunião de ${quando}, vamos usar este link:`,
        `Passando o link da reunião marcada para ${quando}:`,
        `Já deixo aqui o link da reunião (${quando}):`,
        `Reunião marcada para ${quando}. O link é este:`,
      ],
      blocos: [[link]],
      fechos: ['', 'Até lá!', 'Qualquer coisa, é só chamar aqui.', 'Nos vemos lá.', 'Até mais!'],
    },
  }
}
