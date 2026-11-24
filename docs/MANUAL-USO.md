# Manual público de uso

Endereço: `/manual` (e `/manual/`), sem login. Publicação efetiva deve ser
conferida no domínio antes de anunciar o link como disponível.

`src/pages/ManualPage.tsx` apresenta o conteúdo estático de
`src/lib/manualPlataforma.ts` (fachada de `supabase/functions/_shared/manual-plataforma.ts`); estilos em `src/components/manual/manual.css`.
A entrada em `main.tsx` carrega somente o manual nesse caminho, sem montar os
providers, consultas ou captura de console/rede da aplicação privada.
O rodapé autenticado usa navegação completa para essa entrada independente.

Exemplos são fictícios. Não importar inventários/handoffs, cadastros, contatos,
logs ou capturas reais para o manual público. A busca funciona no navegador.
Índice, âncoras, FAQ, glossário e impressão atendem uso no desktop e no celular.

O conteúdo acompanha a versão disponível: funcionalidades em preparação devem
manter esse aviso até a publicação real. Revalidar caminhos, nomes de botões,
links de login e limitações da Íris ao editar. O fluxo de responsáveis usa a migration aplicada com autorização no Desk e
está documentado em `/manual#responsaveis`. A leitura pontual das entregas
usa o monitor administrativo do GT3; não abre DMs nem reenvia mensagens.

## Ajuda interna — publicada e conferida pontualmente em 06/11/2026

O mesmo conteúdo canônico alimenta a ajuda autenticada nos layouts principal e
Chat. Fontes são IDs do manual; destinos internos pertencem a um catálogo fixo,
filtrado por apps/permissões. Pergunta e seis mensagens recentes podem ir ao
provedor configurado, sem ferramentas nem consultas de clientes. A alternativa
local é identificada como consulta do manual, sem alegar uso de IA. Ajuda v2 e
interface publicadas. Com Bruno autenticado, a pergunta “Onde encontro os contratos
de um cliente?” recebeu resposta real com IA, guia, fontes e atalhos, sem dados
de clientes na pergunta. Foi uma única pergunta de orientação, não uma avaliação
irrestrita nem homologação de todos os perfis ou do fallback real. Estudo com a
operação e gravação dos tutoriais seguem pendentes. Plano e evidências em
[Reorganização do Desk](reestruturacao/REORGANIZACAO-DESK.md).
Antes dessa publicação, o delta local de 06/11/2026 registrava que a publicação da função e a resposta real não haviam sido verificadas.
