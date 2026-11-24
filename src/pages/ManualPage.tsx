import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, BookOpen, ChevronDown, Info, Link2, Menu, Printer, Search, X } from 'lucide-react'
import { ATUALIZACAO_MANUAL, SECOES_MANUAL, buscarSecoesManual, type BlocoManual, type SecaoManual } from '../lib/manualPlataforma'
import '../components/manual/manual.css'
import { TutorialVideo } from '../components/manual/TutorialVideo'
import { TUTORIAIS, tutoriaisDaSecao } from '../config/tutoriais'
import { BRAND } from '@/config/brand'
import { RECURSOS } from '@/config/recursos'

const GRUPOS = ['Primeiros passos', 'Trabalho diário', 'Íris e automações', 'Para consultar'] as const

function Bloco({ bloco }: { bloco: BlocoManual }) {
  return (
    <div className="manual-block">
      <h3>{bloco.titulo}</h3>
      {bloco.textos?.map((texto) => <p key={texto}>{texto}</p>)}
      {bloco.passos && <ol className="manual-steps">{bloco.passos.map((passo) => <li key={passo}>{passo}</li>)}</ol>}
      {bloco.itens && <ul className="manual-bullets">{bloco.itens.map((item) => <li key={item}>{item}</li>)}</ul>}
      {bloco.exemplo && (
        <figure className="manual-example">
          <figcaption>Exemplo fictício</figcaption>
          <blockquote>{bloco.exemplo}</blockquote>
        </figure>
      )}
      {bloco.nota && <aside className="manual-note"><Info size={18} aria-hidden="true" /><p>{bloco.nota}</p></aside>}
    </div>
  )
}

function Artigo({ secao, numero, visivel, navegar }: {
  secao: SecaoManual
  numero: number
  visivel: boolean
  navegar: (evento: MouseEvent<HTMLAnchorElement>, id: string) => void
}) {
  return (
    <article id={secao.id} hidden={!visivel} className={`manual-article${secao.emPreparacao ? ' manual-article--planned' : ''}`} aria-labelledby={`titulo-${secao.id}`}>
      <header className="manual-article-header">
        <div className="manual-article-meta"><span className="manual-chapter">{String(numero).padStart(2, '0')}</span><span>{secao.grupo}</span>{secao.emPreparacao && <span className="manual-planned-label">Ainda indisponível</span>}</div>
        <h2 id={`titulo-${secao.id}`} tabIndex={-1}>
          <a href={`#${secao.id}`} onClick={(e) => navegar(e, secao.id)}>
            {secao.titulo}<Link2 size={19} className="manual-heading-link" aria-hidden="true" />
          </a>
        </h2>
        <p className="manual-article-summary">{secao.resumo}</p>
        <p className="manual-audience"><span>Para quem</span> {secao.publico}</p>
      </header>
      {tutoriaisDaSecao(secao.id).map((t) => <TutorialVideo key={t.numero} tutorial={t} />)}
      {secao.blocos.map((bloco) => <Bloco key={bloco.titulo} bloco={bloco} />)}
      {secao.perguntas && (
        <div className="manual-faq">
          {secao.perguntas.map(({ pergunta, resposta }) => (
            <details key={pergunta}>
              <summary>{pergunta}<ChevronDown size={18} aria-hidden="true" /></summary>
              <div className="manual-faq-answer"><p>{resposta}</p></div>
            </details>
          ))}
        </div>
      )}
      {secao.termos && (
        <dl className="manual-glossary">{secao.termos.map(({ termo, definicao }) => <div key={termo}><dt>{termo}</dt><dd>{definicao}</dd></div>)}</dl>
      )}
    </article>
  )
}

/** Guia público: importa apenas conteúdo estático e não inicializa a aplicação privada. */
export function ManualPage() {
  const [busca, setBusca] = useState('')
  const [menuAberto, setMenuAberto] = useState(false)
  const [secaoAtiva, setSecaoAtiva] = useState('comecar')
  const encontradas = useMemo(() => buscarSecoesManual(busca), [busca])
  const idsVisiveis = useMemo(() => new Set(encontradas.map((s) => s.id)), [encontradas])
  const filtrando = busca.trim().length > 0

  useEffect(() => {
    document.title = `Manual de uso · ${BRAND.appName}`
    const id = window.location.hash.slice(1)
    if (id === 'tutoriais') requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))
    if (SECOES_MANUAL.some((s) => s.id === id)) {
      setSecaoAtiva(id)
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))
    }
  }, [])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      const entrada = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (entrada) setSecaoAtiva(entrada.target.id)
    }, { rootMargin: '-100px 0px -60% 0px', threshold: 0 })
    SECOES_MANUAL.filter((s) => idsVisiveis.has(s.id)).forEach((s) => {
      const elemento = document.getElementById(s.id)
      if (elemento) observer.observe(elemento)
    })
    return () => observer.disconnect()
  }, [idsVisiveis])

  function navegar(evento: MouseEvent<HTMLAnchorElement>, id: string) {
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey || evento.button !== 0) return
    evento.preventDefault()
    setBusca('')
    setMenuAberto(false)
    setSecaoAtiva(id)
    window.history.pushState(null, '', `#${id}`)
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' })
      document.getElementById(`titulo-${id}`)?.focus({ preventScroll: true })
    })
  }

  return (
    <div className="manual-shell" id="manual-inicio">
      <a className="manual-skip" href="#manual-conteudo">Pular para o conteúdo</a>
      <header className="manual-topbar">
        <a className="manual-brand" href="#manual-inicio" aria-label={`${BRAND.appName} — início do manual`}>{BRAND.familiaOmnx ? (<><span>OMNX<span className="manual-brand-dot">.</span></span><span className="manual-brand-product">{BRAND.produto.toUpperCase()}</span></>) : <span>{BRAND.appName}</span>}</a>
        <span className="manual-topbar-label"><BookOpen size={15} aria-hidden="true" /> Manual de uso</span>
        <div className="manual-login-links">
          {RECURSOS.linkGt3 && <a href={RECURSOS.linkGt3}>Entrar no GT3<ArrowUpRight size={15} aria-hidden="true" /></a>}
          <a className="manual-login-primary" href="/login">Entrar no {BRAND.produto}<ArrowUpRight size={15} aria-hidden="true" /></a>
        </div>
      </header>

      <div className="manual-hero">
        <div className="manual-hero-copy">
          <p className="manual-eyebrow"><span aria-hidden="true" /> Seu guia de trabalho</p>
          <h1>Menos dúvida.<br /><em>Mais clareza</em> no dia a dia.</h1>
          <p className="manual-hero-intro">Clientes, equipe, contratos, atendimento e Íris. Aprenda onde encontrar cada coisa e confira o que acontece em cada passo.</p>
          <a className="manual-start-link" href="#comecar" onClick={(e) => navegar(e, 'comecar')}>Começar pelo essencial<ArrowDown size={17} aria-hidden="true" /></a>
        </div>
        <aside className="manual-field-guide" aria-label="Três cuidados para usar o Desk">
          <p className="manual-field-guide-label">Pequeno guia, todos os dias</p>
          <ol>
            <li><span aria-hidden="true">01</span><div><strong>Encontre o registro certo.</strong><p>Cliente, contrato e conversa têm papéis diferentes.</p></div></li>
            <li><span aria-hidden="true">02</span><div><strong>Confira antes de agir.</strong><p>Leia o destino, a prévia e os limites da consulta.</p></div></li>
            <li><span aria-hidden="true">03</span><div><strong>Acompanhe o resultado.</strong><p>Salvar, confirmar e enviar são etapas que pedem conferência.</p></div></li>
          </ol>
          <p className="manual-field-guide-foot">Um assunto por vez. No seu ritmo.</p>
        </aside>
      </div>

      <div className="manual-public-notice"><BookOpen size={19} aria-hidden="true" /><p><strong>Este guia é público.</strong> Ele não abre os dados da plataforma. Para trabalhar com informações reais, entre no {BRAND.produto}{RECURSOS.linkGt3 ? ' ou no GT3' : ''} com sua própria conta e os acessos necessários.</p></div>

      {TUTORIAIS.length > 0 && (
      <section className="manual-videos" id="tutoriais" aria-labelledby="titulo-tutoriais">
        <h2 id="titulo-tutoriais">Tutoriais em vídeo</h2>
        <p>Sete vídeos curtos, de 1 a 2 minutos, com narração. Cada um fica no assunto correspondente do manual.</p>
        <ol>{TUTORIAIS.map((t) => (
          <li key={t.numero}><a href={`#${t.secao}`} onClick={(e) => navegar(e, t.secao)}><span>{t.numero}</span><div>{t.titulo}<small>{Math.round(t.segundos / 60) || 1} min · {t.secaoTitulo}</small></div></a></li>
        ))}</ol>
      </section>
      )}

      <div className="manual-workspace">
        <aside className="manual-index">
          <button className="manual-mobile-toggle" type="button" aria-expanded={menuAberto} aria-controls="manual-indice" onClick={() => setMenuAberto(!menuAberto)}><span><Menu size={18} aria-hidden="true" /> Assuntos do manual</span><ChevronDown size={18} aria-hidden="true" /></button>
          <nav id="manual-indice" aria-label="Assuntos do manual" className={`manual-nav${menuAberto ? ' manual-nav--open' : ''}`}>
            <p className="manual-index-label">Neste manual <span>{String(SECOES_MANUAL.length).padStart(2, '0')} assuntos</span></p>
            {GRUPOS.map((grupo) => (
              <div className="manual-nav-group" key={grupo}>
                <p>{grupo}</p>
                <ul>{SECOES_MANUAL.filter((s) => s.grupo === grupo).map((s) => (
                  <li key={s.id}><a href={`#${s.id}`} onClick={(e) => navegar(e, s.id)} aria-current={secaoAtiva === s.id ? 'location' : undefined} className={s.emPreparacao ? 'manual-nav-planned' : undefined}>{s.titulo.replace('Em preparação: ', '')}{s.emPreparacao && <span className="manual-nav-dot" aria-label="Em preparação" />}</a></li>
                ))}</ul>
              </div>
            ))}
            <div className="manual-index-foot"><p>Guia atualizado em<br /><strong>{ATUALIZACAO_MANUAL}</strong></p><button type="button" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Imprimir guia</button></div>
          </nav>
        </aside>

        <main className="manual-main" id="manual-conteudo" tabIndex={-1}>
          <section className="manual-search-section" aria-label="Buscar no manual">
            <label htmlFor="manual-busca">O que você quer fazer?</label>
            <div className="manual-search-box"><Search size={21} aria-hidden="true" /><input id="manual-busca" type="search" value={busca} maxLength={160} onChange={(e) => setBusca(e.target.value)} placeholder="Busque por cliente, contrato, equipe…" autoComplete="off" aria-describedby="manual-resultado-busca" />{busca && <button type="button" aria-label="Limpar busca" onClick={() => { setBusca(''); document.getElementById('manual-busca')?.focus() }}><X size={18} aria-hidden="true" /></button>}</div>
            <div className="manual-search-meta"><p id="manual-resultado-busca" role="status" aria-live="polite">{filtrando ? `${encontradas.length} ${encontradas.length === 1 ? 'assunto encontrado' : 'assuntos encontrados'}` : 'Busca somente neste guia. Nenhuma informação é enviada.'}</p>{filtrando && <button type="button" onClick={() => setBusca('')}>Ver todos os assuntos</button>}</div>
            {!filtrando && <div className="manual-shortcuts"><span>Vá direto a</span>{[{ id: 'clientes', titulo: 'Clientes' }, { id: 'contratos', titulo: 'Contratos' }, { id: 'colaboradores', titulo: 'Equipe' }, { id: 'relatorios', titulo: 'Relatórios' }, { id: 'iris', titulo: 'Íris' }].map((s) => <a key={s.id} href={`#${s.id}`} onClick={(e) => navegar(e, s.id)}>{s.titulo}<ArrowRight size={13} aria-hidden="true" /></a>)}</div>}
          </section>

          {encontradas.length === 0 && <div className="manual-empty"><Search size={30} aria-hidden="true" /><h2>Não encontramos esse assunto.</h2><p>Tente uma palavra mais simples, como “contrato”, “carteira” ou “entrega”. Você também pode escolher um assunto no índice.</p><button type="button" onClick={() => setBusca('')}>Limpar e ver o guia completo<ArrowRight size={16} aria-hidden="true" /></button></div>}

          <div className="manual-articles">{SECOES_MANUAL.map((secao, i) => <Artigo key={secao.id} secao={secao} numero={i + 1} visivel={idsVisiveis.has(secao.id)} navegar={navegar} />)}</div>
          <div className="manual-bottom-note"><p><strong>Seu menu pode ser diferente.</strong> Recursos, nomes e opções dependem dos aplicativos habilitados e das permissões da sua empresa. Se faltar algo necessário, confirme com a administração.</p><a href="#suporte" onClick={(e) => navegar(e, 'suporte')}>Como reportar um problema<ArrowRight size={16} aria-hidden="true" /></a></div>
        </main>
      </div>

      <footer className="manual-footer"><div><a className="manual-footer-brand" href="#manual-inicio">{BRAND.appName}</a><p>Manual público de uso · Exemplos fictícios</p></div><a href="#manual-inicio">Voltar ao início<ArrowUp size={15} aria-hidden="true" /></a></footer>
    </div>
  )
}

export default ManualPage
