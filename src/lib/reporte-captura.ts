/**
 * Captura de tela para o Reporte de Erros.
 *
 * Usa html2canvas (redesenha o DOM num canvas) e **não** a Screen Capture API do
 * navegador. A diferença importa: a API nativa abre um diálogo de permissão a
 * cada uso, e quem está com um problema na tela não vai parar para conceder
 * permissão — na prática, ninguém anexaria print nenhum.
 *
 * O que isso significa e não significa: o resultado é uma imagem do DOM como o
 * navegador o desenharia. Conteúdo de `<iframe>` de outro domínio e vídeo não
 * aparecem (o navegador não deixa) — o print sai com o espaço em branco, o que é
 * honesto e não impede o diagnóstico.
 */

/** Cabe no bucket (5 MB) com folga e ainda dá para ler texto na imagem. */
const LARGURA_MAXIMA = 1600

/**
 * Fotografa a tela atual e devolve um `File` pronto para upload.
 * Devolve `null` se a captura falhar — anexo é um plus, não pode derrubar o
 * envio do reporte.
 *
 * `ignorar` recebe os elementos que não devem sair na foto (o próprio modal de
 * reporte, por exemplo — fotografar o formulário em vez da tela com o problema
 * seria inútil).
 */
export async function capturarTela(ignorar?: (HTMLElement | null)[]): Promise<File | null> {
  if (typeof window === 'undefined') return null

  try {
    // Import dinâmico: html2canvas tem ~200 KB e só é necessário quando alguém
    // vai de fato reportar um problema — não faz sentido no bundle inicial.
    const { default: html2canvas } = await import('html2canvas')

    const ignorados = new Set((ignorar ?? []).filter(Boolean) as HTMLElement[])

    const canvas = await html2canvas(document.body, {
      logging: false,
      useCORS: true,
      // Fotografa só a área visível: a tela que a pessoa está vendo é a que
      // interessa, e a página inteira sairia gigante.
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
      scrollX: 0,
      scrollY: -window.scrollY,
      scale: Math.min(window.devicePixelRatio || 1, 2),
      ignoreElements: (el) => ignorados.has(el as HTMLElement),
    })

    // Reduz se passar da largura máxima, mantendo proporção.
    const alvo =
      canvas.width > LARGURA_MAXIMA
        ? redimensionar(canvas, LARGURA_MAXIMA)
        : canvas

    const blob = await new Promise<Blob | null>((resolve) =>
      alvo.toBlob((b) => resolve(b), 'image/jpeg', 0.85),
    )
    if (!blob) return null

    return new File([blob], `tela-${Date.now()}.jpg`, { type: 'image/jpeg' })
  } catch {
    // Falha de captura não pode impedir o reporte. O usuário ainda descreve o
    // problema e os buffers de console/rede seguem anexados.
    return null
  }
}

function redimensionar(origem: HTMLCanvasElement, largura: number): HTMLCanvasElement {
  const destino = document.createElement('canvas')
  const escala = largura / origem.width
  destino.width = largura
  destino.height = Math.round(origem.height * escala)
  destino.getContext('2d')?.drawImage(origem, 0, 0, destino.width, destino.height)
  return destino
}
