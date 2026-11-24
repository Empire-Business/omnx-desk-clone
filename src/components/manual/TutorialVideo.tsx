import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { linkVimeo, type Tutorial } from '../../config/tutoriais'

function useTelaEstreita() {
  const consulta = '(max-width: 640px)'
  const [estreita, setEstreita] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(consulta).matches === true)
  useEffect(() => {
    const mq = window.matchMedia?.(consulta)
    if (!mq) return
    const mudar = () => setEstreita(mq.matches)
    mq.addEventListener?.('change', mudar)
    return () => mq.removeEventListener?.('change', mudar)
  }, [])
  return estreita
}

const duracao = (s: number) => `${Math.floor(s / 60)}min${String(Math.round(s % 60)).padStart(2, '0')}`

/**
 * Tutorial em vídeo (Vimeo, não listado). Nada é carregado do Vimeo até a
 * pessoa clicar em Assistir: a página continua leve e sem rastreio prévio.
 * No celular usa a versão vertical (9:16); no computador, a horizontal.
 */
export function TutorialVideo({ tutorial }: { tutorial: Tutorial }) {
  const [tocando, setTocando] = useState(false)
  const estreita = useTelaEstreita()
  const video = estreita ? tutorial.vertical : tutorial.horizontal
  return (
    <figure className={`manual-video${estreita ? ' manual-video--vertical' : ''}`}>
      <div className="manual-video-frame">
        {tocando ? (
          <iframe
            src={`https://player.vimeo.com/video/${video.id}?h=${video.hash}&dnt=1&autoplay=1&title=0&byline=0&portrait=0`}
            title={`Tutorial: ${tutorial.titulo}`}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <button type="button" className="manual-video-play" onClick={() => setTocando(true)} aria-label={`Assistir ao tutorial ${tutorial.titulo}`}>
            <span className="manual-video-icon" aria-hidden="true"><Play size={22} /></span>
            <span className="manual-video-label">Assistir · {duracao(tutorial.segundos)}</span>
          </button>
        )}
      </div>
      <figcaption>
        <span className="manual-video-num">Tutorial {tutorial.numero}</span> {tutorial.titulo}
        {' · '}
        <a href={linkVimeo(video)} target="_blank" rel="noopener noreferrer">abrir em outra aba</a>
      </figcaption>
    </figure>
  )
}
