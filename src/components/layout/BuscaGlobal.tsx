import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useAcessoNavegacao } from '@/hooks/useAcessoNavegacao'
import { useClientes } from '@/hooks/useClientes'
import { ITENS_PRINCIPAIS, ITEM_AJUSTES } from '@/config/navegacao'

type Resultado = { chave: string; grupo: 'Telas' | 'Clientes'; titulo: string; apoio?: string; rota: string }

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Busca global da barra superior. Só LÊ o que o usuário já enxerga:
 * - Telas: os mesmos itens e regras de acesso do menu (`pode`).
 * - Clientes: `useClientes`, que já respeita carteira e RLS.
 * Nada novo é consultado no banco e nenhuma regra de acesso muda.
 */
export function BuscaGlobal() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const caixaRef = useRef<HTMLDivElement>(null)
  const [texto, setTexto] = useState('')
  const [aberta, setAberta] = useState(false)
  const [ativo, setAtivo] = useState(0)

  // ⌘K / Ctrl+K foca a busca.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Com o foco num campo de digitação, o atalho não sequestra a tecla.
      const alvo = e.target as HTMLElement | null
      const digitando = !!alvo && (
        alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName)
      )
      if (digitando) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Clique fora fecha.
  useEffect(() => {
    if (!aberta) return
    const onDown = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberta(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [aberta])

  const fechar = () => { setAberta(false); setTexto(''); inputRef.current?.blur() }
  const ir = (r: Resultado) => { fechar(); navigate(r.rota) }

  return (
    <div className="cume-top-search" ref={caixaRef}>
      <Search aria-hidden className="h-[17px] w-[17px] shrink-0" />
      <input
        ref={inputRef}
        type="search"
        value={texto}
        placeholder="Buscar no sistema…"
        aria-label="Buscar no sistema"
        role="combobox"
        aria-expanded={aberta && texto.trim().length > 0}
        aria-controls="busca-global-lista"
        autoComplete="off"
        onFocus={() => setAberta(true)}
        onChange={(e) => { setTexto(e.target.value); setAberta(true); setAtivo(0) }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); fechar() }
        }}
      />
      <kbd aria-hidden>⌘ K</kbd>
      {aberta && texto.trim().length > 0 && (
        <Resultados texto={texto} ativo={ativo} setAtivo={setAtivo} onEscolher={ir} inputRef={inputRef} />
      )}
    </div>
  )
}

function Resultados({
  texto, ativo, setAtivo, onEscolher, inputRef,
}: {
  texto: string
  ativo: number
  setAtivo: (n: number) => void
  onEscolher: (r: Resultado) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const { pode } = useAcessoNavegacao()
  const { data: clientes, isLoading } = useClientes()
  const termo = semAcento(texto.trim())

  const lista = useMemo<Resultado[]>(() => {
    const telas: Resultado[] = [...ITENS_PRINCIPAIS, ITEM_AJUSTES]
      .filter((i) => pode(i.acesso))
      .filter((i) => semAcento(`${i.rotulo} ${i.descricao ?? ''}`).includes(termo))
      .slice(0, 4)
      .map((i) => ({ chave: `t-${i.id}`, grupo: 'Telas', titulo: i.rotulo, apoio: i.descricao, rota: i.rota }))
    const cl: Resultado[] = (clientes ?? [])
      .filter((c) => semAcento([c.nome, c.razao_social, c.cnpj, c.email].filter(Boolean).join(' ')).includes(termo))
      .slice(0, 6)
      .map((c) => ({ chave: `c-${c.id}`, grupo: 'Clientes', titulo: c.nome, apoio: c.razao_social ?? undefined, rota: `/clientes/${c.id}` }))
    return [...telas, ...cl]
  }, [clientes, pode, termo])

  // Setas e Enter vêm do campo de texto.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo(Math.min(ativo + 1, lista.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(Math.max(ativo - 1, 0)) }
      else if (e.key === 'Enter' && lista[ativo]) { e.preventDefault(); onEscolher(lista[ativo]) }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [ativo, lista, onEscolher, setAtivo, inputRef])

  return (
    <div id="busca-global-lista" role="listbox" className="cume-busca-lista">
      {lista.length === 0 && (
        <p className="cume-busca-vazio">{isLoading ? 'Buscando…' : 'Nada encontrado.'}</p>
      )}
      {lista.map((r, i) => (
        <div key={r.chave}>
          {(i === 0 || lista[i - 1].grupo !== r.grupo) && <p className="cume-busca-grupo">{r.grupo}</p>}
          <button
            type="button"
            role="option"
            aria-selected={i === ativo}
            className="cume-busca-item"
            data-ativo={i === ativo || undefined}
            onMouseEnter={() => setAtivo(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onEscolher(r)}
          >
            <strong>{r.titulo}</strong>
            {r.apoio && <small>{r.apoio}</small>}
          </button>
        </div>
      ))}
    </div>
  )
}
