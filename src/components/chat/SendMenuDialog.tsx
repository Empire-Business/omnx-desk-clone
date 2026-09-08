import { useState } from 'react'
import { Send, Plus, X, List, BarChart3, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { useSendMenu } from '@/hooks/useChat'

interface SendMenuDialogProps {
  open: boolean
  onClose: () => void
  instanceId: string
  conversationId: string
  contactNumber: string
}

type MenuType = 'button' | 'list' | 'poll' | 'carousel'

const MENU_TYPES: { value: MenuType; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'button', label: 'Botoes', icon: <LayoutGrid className="h-4 w-4" />, desc: 'Botoes de acao rapida' },
  { value: 'list', label: 'Lista', icon: <List className="h-4 w-4" />, desc: 'Menu com secoes e itens' },
  { value: 'poll', label: 'Enquete', icon: <BarChart3 className="h-4 w-4" />, desc: 'Votacao com opcoes' },
]

export function SendMenuDialog({
  open,
  onClose,
  instanceId,
  conversationId,
  contactNumber,
}: SendMenuDialogProps) {
  const sendMenuMutation = useSendMenu()
  const [menuType, setMenuType] = useState<MenuType>('button')
  const [text, setText] = useState('')
  const [footerText, setFooterText] = useState('')
  const [listButton, setListButton] = useState('Ver opcoes')
  const [selectableCount, setSelectableCount] = useState(1)
  const [choices, setChoices] = useState<string[]>([''])

  function addChoice() {
    setChoices((prev) => [...prev, ''])
  }

  function removeChoice(index: number) {
    setChoices((prev) => prev.filter((_, i) => i !== index))
  }

  function updateChoice(index: number, value: string) {
    setChoices((prev) => prev.map((c, i) => (i === index ? value : c)))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validChoices = choices.filter((c) => c.trim())
    if (!text.trim() || validChoices.length === 0) return

    sendMenuMutation.mutate(
      {
        instance_id: instanceId,
        conversation_id: conversationId,
        number: contactNumber,
        type: menuType,
        text: text.trim(),
        choices: validChoices,
        footerText: footerText.trim() || undefined,
        listButton: menuType === 'list' ? listButton.trim() || 'Ver opcoes' : undefined,
        selectableCount: menuType === 'poll' ? selectableCount : undefined,
      },
      {
        onSuccess: () => {
          onClose()
          setText('')
          setFooterText('')
          setChoices([''])
        },
      },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Enviar menu interativo" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Menu type selector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {MENU_TYPES.map((mt) => (
            <button
              key={mt.value}
              type="button"
              onClick={() => setMenuType(mt.value)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all',
                menuType === mt.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/30 hover:bg-muted/50',
              )}
            >
              {mt.icon}
              <span className="text-xs font-medium">{mt.label}</span>
              <span className="text-2xs opacity-70">{mt.desc}</span>
            </button>
          ))}
        </div>

        {/* Main text */}
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Texto principal *</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Como podemos ajudar?"
            required
            rows={2}
            className={cn(
              'w-full rounded-lg border border-input bg-background px-3 py-2 resize-none',
              'text-sm focus:outline-none focus:ring-2 focus:ring-ring',
            )}
          />
        </div>

        {/* Choices */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-foreground">
              {menuType === 'poll' ? 'Opcoes de voto' : menuType === 'list' ? 'Itens da lista' : 'Botoes'} *
            </label>
            <button
              type="button"
              onClick={addChoice}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus className="h-3 w-3" /> Adicionar
            </button>
          </div>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {choices.map((choice, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-5 text-center shrink-0">{i + 1}</span>
                <input
                  type="text"
                  value={choice}
                  onChange={(e) => updateChoice(i, e.target.value)}
                  placeholder={
                    menuType === 'button'
                      ? 'Texto do botao|id (ex: Suporte|suporte)'
                      : menuType === 'list'
                        ? '[Secao] ou Titulo|id|descricao'
                        : 'Opcao de voto'
                  }
                  className={cn(
                    'flex-1 rounded-lg border border-input bg-background px-3 py-1.5',
                    'text-sm focus:outline-none focus:ring-2 focus:ring-ring',
                  )}
                />
                {choices.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeChoice(i)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {menuType === 'button' && (
            <p className="mt-1 text-2xs text-muted-foreground">
              Formatos: "Texto|id", "Texto|https://url", "Texto|call:+5511999", "Texto|copy:codigo"
            </p>
          )}
          {menuType === 'list' && (
            <p className="mt-1 text-2xs text-muted-foreground">
              Use [Nome] para criar secoes. Itens: "Titulo|id|descricao"
            </p>
          )}
        </div>

        {/* Footer text (buttons & list) */}
        {(menuType === 'button' || menuType === 'list') && (
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Texto do rodape <span className="text-muted-foreground">(opcional)</span>
            </label>
            <input
              type="text"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Escolha uma das opcoes"
              className={cn(
                'w-full rounded-lg border border-input bg-background px-3 py-2',
                'text-sm focus:outline-none focus:ring-2 focus:ring-ring',
              )}
            />
          </div>
        )}

        {/* List button text */}
        {menuType === 'list' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Texto do botao da lista</label>
            <input
              type="text"
              value={listButton}
              onChange={(e) => setListButton(e.target.value)}
              placeholder="Ver opcoes"
              className={cn(
                'w-full rounded-lg border border-input bg-background px-3 py-2',
                'text-sm focus:outline-none focus:ring-2 focus:ring-ring',
              )}
            />
          </div>
        )}

        {/* Poll selectable count */}
        {menuType === 'poll' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Opcoes selecionaveis</label>
            <input
              type="number"
              value={selectableCount}
              onChange={(e) => setSelectableCount(parseInt(e.target.value) || 1)}
              min={1}
              max={choices.length}
              className={cn(
                'w-24 rounded-lg border border-input bg-background px-3 py-2',
                'text-sm focus:outline-none focus:ring-2 focus:ring-ring',
              )}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={sendMenuMutation.isPending || !text.trim() || choices.filter((c) => c.trim()).length === 0}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {sendMenuMutation.isPending ? 'Enviando...' : 'Enviar menu'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
