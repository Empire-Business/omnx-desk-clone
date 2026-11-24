import { useState } from 'react'
import { Loader2, Phone, Plus, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { mensagemErroWa, type CandidatoAgente } from '@/hooks/useAutomacoesWa'
import {
  useEquipeIdentidades, useExcluirIdentidadeEquipe, useSalvarIdentidadeEquipe,
} from '@/hooks/useEquipeIdentidades'
import { mascaraTelefone } from '@/lib/automacoesWa'
import {
  ROTULO_ORIGEM, finalTelefone, identidadesPorPessoa, validarTelefoneEquipe, type IdentidadeEquipeTela,
} from '@/lib/equipeIdentidades'
import { cn } from '@/lib/utils'
import { Aviso, Dica, MensagemErro, Secao } from './comum'
import { botaoPrimario, campo, foco } from './estilos'

/**
 * "WhatsApp pessoal da equipe": o admin informa o número de cada pessoa para o
 * sistema reconhecer quando é alguém da equipe escrevendo nos grupos dos
 * clientes (não confundir com o cliente, nem acender "aguardando resposta").
 */
export function EquipeWhatsappSecao({ candidatos, carregando }: { candidatos: CandidatoAgente[]; carregando: boolean }) {
  const lista = useEquipeIdentidades()
  const salvar = useSalvarIdentidadeEquipe()
  const excluir = useExcluirIdentidadeEquipe()
  const [userId, setUserId] = useState('')
  const [telefone, setTelefone] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [apagar, setApagar] = useState<{ item: IdentidadeEquipeTela; nome: string } | null>(null)

  const itens = lista.data ?? []
  const porPessoa = identidadesPorPessoa(itens.filter((i) => i.ativo))
  const daEmpresa = itens.filter((i) => i.origem === 'instancia' && i.ativo).length
  const comNumero = candidatos.filter((c) => porPessoa.has(c.user_id))
  const semNumero = candidatos.filter((c) => !porPessoa.has(c.user_id))

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    const v = validarTelefoneEquipe(userId, telefone, porPessoa.get(userId) ?? [])
    if (!v.ok) { setErro(v.erro); return }
    salvar.mutate({ user_id: userId, telefone: v.telefone }, {
      onSuccess: () => { setUserId(''); setTelefone('') },
      onError: (err) => setErro(mensagemErroWa(err, 'Não foi possível salvar.')),
    })
  }

  return (
    <Secao titulo="WhatsApp pessoal da equipe"
      descricao="Para o sistema saber quando é alguém da equipe falando nos grupos dos clientes. Quem escreve do celular pessoal aparecia como se fosse o cliente.">
      {lista.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
        : lista.error ? <MensagemErro texto={mensagemErroWa(lista.error, 'Não foi possível carregar.')} />
          : lista.data === null ? <Aviso>O banco ainda não tem a tabela de números da equipe. Peça para aplicar a atualização.</Aviso>
            : (
              <>
                <Dica>
                  Com o número cadastrado, a mensagem dessa pessoa no grupo do cliente conta como resposta da equipe: some o
                  "aguardando resposta" e a análise de satisfação deixa de achar que o cliente falou sozinho. Só os 4 últimos
                  dígitos aparecem aqui. Só vale para mensagens que chegam por números da empresa protegidos (seção "Proteger conexão").
                  {' '}{daEmpresa > 0 && `Os ${daEmpresa} números da empresa já são reconhecidos sozinhos.`}
                </Dica>

                {comNumero.length > 0 && (
                  <ul className="divide-y divide-border">
                    {comNumero.map((c) => (
                      <li key={c.user_id} className="flex flex-wrap items-center gap-2 py-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{c.nome}</span>
                        {(porPessoa.get(c.user_id) ?? []).map((i) => (
                          <span key={i.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground"
                            title={ROTULO_ORIGEM[i.origem]}>
                            <Phone className="h-3 w-3" aria-hidden />
                            {finalTelefone(i.telefone_fim)}
                            <span className="text-muted-foreground">· {ROTULO_ORIGEM[i.origem]}</span>
                            {i.origem === 'cadastro' && (
                              <button type="button" aria-label={`Remover o WhatsApp ${finalTelefone(i.telefone_fim)} de ${c.nome}`}
                                onClick={() => setApagar({ item: i, nome: c.nome })}
                                className={cn('rounded-full p-0.5 text-muted-foreground hover:text-danger', foco)}>
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}

                <form onSubmit={adicionar} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <label className="space-y-1 text-sm">
                    <span className="text-foreground">Pessoa da equipe</span>
                    <select className={cn(campo, 'w-full')} value={userId} onChange={(e) => setUserId(e.target.value)} disabled={carregando}>
                      <option value="">{carregando ? 'Carregando…' : 'Escolha…'}</option>
                      {[...semNumero, ...comNumero].map((c) => (
                        <option key={c.user_id} value={c.user_id}>{c.nome}{porPessoa.has(c.user_id) ? ' (já tem número)' : ''}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-foreground">WhatsApp pessoal</span>
                    <input className={cn(campo, 'w-full')} value={telefone} inputMode="tel" autoComplete="off"
                      onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} placeholder="(11) 99999-8888" />
                  </label>
                  <button type="submit" disabled={salvar.isPending} className={botaoPrimario}>
                    {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
                  </button>
                </form>
                {semNumero.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {semNumero.length} {semNumero.length === 1 ? 'pessoa ainda sem número' : 'pessoas ainda sem número'}.
                    Enquanto isso, o sistema tenta reconhecer pelo nome no WhatsApp, mas isso não apaga o "aguardando resposta" — só o número cadastrado apaga.
                  </p>
                )}
              </>
            )}
      <MensagemErro texto={erro} />

      <ConfirmDialog open={apagar !== null} onClose={() => setApagar(null)}
        title="Remover este WhatsApp?"
        description={apagar ? `As próximas mensagens desse número (${finalTelefone(apagar.item.telefone_fim)}) deixam de contar como de ${apagar.nome}. As mensagens antigas não mudam.` : ''}
        confirmLabel="Remover" loading={excluir.isPending}
        onConfirm={() => apagar && excluir.mutate(apagar.item.id, {
          onSuccess: () => setApagar(null),
          onError: (err) => { setApagar(null); setErro(mensagemErroWa(err, 'Não foi possível remover.')) },
        })} />
    </Secao>
  )
}
