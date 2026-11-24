// Conversa de WhatsApp como DADO NÃO CONFIÁVEL — limpeza comum a quem monta
// transcrição para uma IA (linha do tempo do cliente, ferramentas da Íris).
//
// Módulo PURO (sem banco, sem rede, sem Deno). Mesmo tratamento que
// wa-auto-satisfacao/regras.ts (neutralizarRotulos) e
// wa-auto-resumo-semanal/regras.ts (linhaTranscricao) já aplicam, num lugar só;
// a versão daqui é um SUPERCONJUNTO: também neutraliza os rótulos da linha do
// tempo ("Equipe (Ana):", "IA:", "[G1]").
//
// O que garante numa linha de conversa:
//   * uma linha só, sem caracteres de controle/invisíveis, espaços colapsados;
//   * sem "<" ">" (ninguém fecha o bloco de dados delimitado por tags);
//   * o cliente não consegue forjar outra mensagem/autor dentro da própria:
//     carimbo "[24/10 14:32]" vira "(data)", canal "[G1]" vira "(canal)" e
//     "Cliente:", "Equipe:", "Equipe (Ana):", "IA:", "Sistema:" perdem os
//     dois-pontos ("Equipe (Ana) -").

const CONTROLE = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u206F\\uFEFF]', 'g')

/** Texto de UMA mensagem: uma linha, sem controle e sem "<" ">", até `max` caracteres. */
export function linhaDado(conteudo: unknown, max = 500): string {
  if (typeof conteudo !== 'string') return ''
  return conteudo.replace(CONTROLE, ' ').replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Tira de dentro do texto de UMA mensagem o que imita os rótulos da transcrição
 * (no início ou no meio da linha).
 */
export function neutralizarRotulos(linha: string): string {
  return linha
    .replace(/\[\s*\d{1,2}\s*[/.-]\s*\d{1,2}[^\]]{0,24}\]/g, '(data)')
    .replace(/\[\s*[GgPp]\s*\d{1,3}\s*\]/g, '(canal)')
    .replace(/\b(cliente|equipe|ia|sistema)(\s*\([^)\n]{0,40}\))?\s*[:：]/giu, '$1$2 -')
}

/** linhaDado + neutralizarRotulos. */
export function textoSeguroDeMensagem(conteudo: unknown, max = 500): string {
  return neutralizarRotulos(linhaDado(conteudo, max))
}
