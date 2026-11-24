import { useState, type FormEvent, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useCreateLesson, useCreateModule, useCreatePath } from '@/hooks/useTrilhas'
import { mensagemErro } from '@/lib/mensagemErro'
import { ROTULO_TIPO_AULA, validarAula, type ErrosAula, type RascunhoAula, type TipoAula } from '@/lib/aulasEquipe'

/**
 * Formulários de montar trilha (trilha → módulos → aulas). Só aparecem para o
 * perfil admin (`podeMontarTrilhas`), a mesma regra da RLS de escrita; quem
 * chegar aqui sem ela recebe o erro do banco, sem gravar nada.
 */

function Erro({ texto }: { texto?: string }) {
  if (!texto) return null
  return <p className="err" role="alert"><AlertCircle className="h-3.5 w-3.5" aria-hidden />{texto}</p>
}

function FalhaAoSalvar({ erro }: { erro: unknown }) {
  if (!erro) return null
  return (
    <div role="alert" className="rounded-md bg-danger-light px-3 py-2 text-[13px] text-danger">
      Não deu para salvar. Confira a conexão e tente de novo.
      <span className="mt-0.5 block text-[12px] opacity-80">{mensagemErro(erro)}</span>
    </div>
  )
}

function Rodape({ salvando, rotulo, onClose, form }: { salvando: boolean; rotulo: string; onClose: () => void; form: string }) {
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
      <button type="submit" form={form} className="btn btn-primary" disabled={salvando}>
        {salvando ? 'Salvando…' : rotulo}
      </button>
    </>
  )
}

function Campos({ id, onSubmit, children }: { id: string; onSubmit: (e: FormEvent) => void; children: ReactNode }) {
  return <form id={id} onSubmit={onSubmit} className="grid gap-4" noValidate>{children}</form>
}

// ─── Trilha ───────────────────────────────────────────────────────────────────

export function NovaTrilhaModal({ open, onClose, ordem, onCriada }: {
  open: boolean
  onClose: () => void
  ordem: number
  onCriada: (id: string) => void
}) {
  const criar = useCreatePath()
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState<string>()

  const fechar = () => { setTitulo(''); setDescricao(''); setErro(undefined); criar.reset(); onClose() }

  const salvar = (e: FormEvent) => {
    e.preventDefault()
    if (!titulo.trim()) { setErro('Dê um nome para a trilha.'); return }
    criar.mutate(
      { titulo: titulo.trim(), descricao: descricao.trim() || undefined, tipo: 'interno', ordem },
      { onSuccess: (trilha) => { fechar(); onCriada(trilha.id) } },
    )
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Nova trilha da equipe"
      description="A trilha reúne módulos e aulas. Depois de criar, adicione o primeiro módulo."
      footer={<Rodape salvando={criar.isPending} rotulo="Criar trilha" onClose={fechar} form="form-nova-trilha" />}
    >
      <Campos id="form-nova-trilha" onSubmit={salvar}>
        <div className="field">
          <label htmlFor="trilha-titulo">Nome</label>
          <input id="trilha-titulo" className="input" value={titulo} maxLength={120} autoFocus
            aria-invalid={erro ? true : undefined}
            onChange={(e) => { setTitulo(e.target.value); setErro(undefined) }}
            placeholder="Ex.: Primeiros dias no atendimento" />
          <Erro texto={erro} />
        </div>
        <div className="field">
          <label htmlFor="trilha-descricao">O que a pessoa aprende <span className="font-normal text-muted-foreground">(opcional)</span></label>
          <textarea id="trilha-descricao" className="textarea" value={descricao} maxLength={600} rows={3}
            onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <FalhaAoSalvar erro={criar.error} />
      </Campos>
    </Modal>
  )
}

// ─── Módulo ───────────────────────────────────────────────────────────────────

export function NovoModuloModal({ open, onClose, pathId, ordem }: {
  open: boolean
  onClose: () => void
  pathId: string
  ordem: number
}) {
  const criar = useCreateModule()
  const [titulo, setTitulo] = useState('')
  const [erro, setErro] = useState<string>()

  const fechar = () => { setTitulo(''); setErro(undefined); criar.reset(); onClose() }

  const salvar = (e: FormEvent) => {
    e.preventDefault()
    if (!titulo.trim()) { setErro('Dê um nome para o módulo.'); return }
    criar.mutate({ path_id: pathId, titulo: titulo.trim(), ordem }, { onSuccess: fechar })
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Novo módulo"
      description="Módulos agrupam as aulas da trilha, na ordem em que foram criados."
      size="sm"
      footer={<Rodape salvando={criar.isPending} rotulo="Criar módulo" onClose={fechar} form="form-novo-modulo" />}
    >
      <Campos id="form-novo-modulo" onSubmit={salvar}>
        <div className="field">
          <label htmlFor="modulo-titulo">Nome</label>
          <input id="modulo-titulo" className="input" value={titulo} maxLength={120} autoFocus
            aria-invalid={erro ? true : undefined}
            onChange={(e) => { setTitulo(e.target.value); setErro(undefined) }}
            placeholder="Ex.: Conhecendo o Desk" />
          <Erro texto={erro} />
        </div>
        <FalhaAoSalvar erro={criar.error} />
      </Campos>
    </Modal>
  )
}

// ─── Aula ─────────────────────────────────────────────────────────────────────

const RASCUNHO_VAZIO: RascunhoAula = { titulo: '', tipo: 'video', conteudo_url: '', conteudo_texto: '', duracao_minutos: '' }

const AJUDA_URL: Record<Exclude<TipoAula, 'texto'>, string> = {
  video: 'YouTube e Vimeo (também não listado) abrem dentro da aula; outro endereço de vídeo toca no player do navegador. Só https://.',
  pdf: 'Endereço público do arquivo PDF, com https://.',
  link: 'A aula mostra um botão que abre esse endereço em outra aba.',
}

export function NovaAulaModal({ open, onClose, moduleId, moduloTitulo, ordem }: {
  open: boolean
  onClose: () => void
  moduleId: string
  moduloTitulo: string
  ordem: number
}) {
  const criar = useCreateLesson()
  const [r, setR] = useState<RascunhoAula>(RASCUNHO_VAZIO)
  const [descricao, setDescricao] = useState('')
  const [erros, setErros] = useState<ErrosAula>({})

  const muda = <K extends keyof RascunhoAula>(campo: K, valor: RascunhoAula[K]) => {
    setR((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: undefined }))
  }
  const fechar = () => { setR(RASCUNHO_VAZIO); setDescricao(''); setErros({}); criar.reset(); onClose() }

  const salvar = (e: FormEvent) => {
    e.preventDefault()
    const encontrados = validarAula(r)
    if (Object.keys(encontrados).length) { setErros(encontrados); return }
    criar.mutate(
      {
        module_id: moduleId,
        titulo: r.titulo.trim(),
        descricao: descricao.trim() || undefined,
        tipo: r.tipo,
        conteudo_url: r.tipo === 'texto' ? undefined : r.conteudo_url.trim(),
        conteudo_texto: r.tipo === 'texto' ? r.conteudo_texto.trim() : undefined,
        duracao_minutos: r.duracao_minutos.trim() ? Number(r.duracao_minutos) : undefined,
        ordem,
      },
      { onSuccess: fechar },
    )
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Nova aula"
      description={`No módulo ${moduloTitulo}.`}
      footer={<Rodape salvando={criar.isPending} rotulo="Criar aula" onClose={fechar} form="form-nova-aula" />}
    >
      <Campos id="form-nova-aula" onSubmit={salvar}>
        <div className="field">
          <label htmlFor="aula-titulo">Nome</label>
          <input id="aula-titulo" className="input" value={r.titulo} maxLength={160} autoFocus
            aria-invalid={erros.titulo ? true : undefined}
            onChange={(e) => muda('titulo', e.target.value)} />
          <Erro texto={erros.titulo} />
        </div>

        <fieldset className="field">
          <legend className="field-label mb-1.5">Formato</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ROTULO_TIPO_AULA) as TipoAula[]).map((tipo) => (
              <button key={tipo} type="button" className="chip" aria-pressed={r.tipo === tipo} onClick={() => muda('tipo', tipo)}>
                {ROTULO_TIPO_AULA[tipo]}
              </button>
            ))}
          </div>
        </fieldset>

        {r.tipo === 'texto' ? (
          <div className="field">
            <label htmlFor="aula-texto">Conteúdo</label>
            <textarea id="aula-texto" className="textarea" rows={7} value={r.conteudo_texto}
              aria-invalid={erros.conteudo_texto ? true : undefined}
              onChange={(e) => muda('conteudo_texto', e.target.value)} />
            <span className="hint">Texto simples; as quebras de linha são mantidas.</span>
            <Erro texto={erros.conteudo_texto} />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="aula-url">Endereço</label>
            <input id="aula-url" className="input" type="url" inputMode="url" value={r.conteudo_url}
              placeholder="https://"
              aria-invalid={erros.conteudo_url ? true : undefined}
              onChange={(e) => muda('conteudo_url', e.target.value)} />
            <span className="hint">{AJUDA_URL[r.tipo]}</span>
            <Erro texto={erros.conteudo_url} />
          </div>
        )}

        <div className="field max-w-[180px]">
          <label htmlFor="aula-duracao">Duração em minutos <span className="font-normal text-muted-foreground">(opcional)</span></label>
          <input id="aula-duracao" className="input" inputMode="numeric" value={r.duracao_minutos}
            aria-invalid={erros.duracao_minutos ? true : undefined}
            onChange={(e) => muda('duracao_minutos', e.target.value)} />
          <Erro texto={erros.duracao_minutos} />
        </div>

        <div className="field">
          <label htmlFor="aula-descricao">Resumo <span className="font-normal text-muted-foreground">(opcional)</span></label>
          <textarea id="aula-descricao" className="textarea" rows={2} value={descricao} maxLength={600}
            onChange={(e) => setDescricao(e.target.value)} />
        </div>

        <FalhaAoSalvar erro={criar.error} />
      </Campos>
    </Modal>
  )
}
