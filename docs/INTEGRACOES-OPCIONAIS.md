# Integrações opcionais do Desk (passo a passo para a IA)

> Atualizado em: 18/11/2026 às 19h40 BRT
> Para a IA que instalou o Desk na conta da pessoa (Claude Code ou Codex, com o Agenor).

O Desk funciona sem nenhuma destas integrações. Ligue uma por vez, só quando a pessoa pedir ou
quando ela quiser usar a parte do app que depende dela. Regras para todas:

- **Nunca peça chave ou token no chat.** A pessoa cola no arquivo de chaves:
  `node .htai/instalador.mjs abrir-chaves`. Depois você envia às funções com
  `node .htai/instalador.mjs segredo <NOME>` (um ou mais nomes).
- Explique antes o que a integração faz e se ela cobra (quem cobra é o serviço, não o Desk).
- Depois de ligar, teste pelo próprio app e diga à pessoa onde ver o resultado.
- Para desligar: apague o valor no arquivo de chaves e rode `segredo <NOME>` de novo com outro valor, ou
  remova o segredo no painel do Supabase (Edge Functions > Secrets). Nada é apagado do banco.

## 1. WhatsApp (UAZAPI)

O coração do atendimento. Guia do serviço: `.htai/guias/uazapi.md`.

1. A pessoa cria a conta e o número na UAZAPI e conecta pelo QR Code no painel de lá.
2. Endereço do servidor dela (parecido com `https://suaempresa.uazapi.com`): no app, **Automações > Conexão**
   (ou Admin > Integrações). Se preferir pelo instalador: `UAZAPI_URL` no arquivo de chaves e rode o passo `funcoes`.
3. No app, **Conversas > Instâncias**: cadastre o número com o **mesmo nome** da instância da UAZAPI e cole o
   token do número no campo da tela (fica no cofre do banco, não no código). Números só da Cobrança: na tela de
   números da Cobrança.
4. Copie o endereço do webhook em **Admin > Integrações** e cole no painel da UAZAPI.
5. Teste: mande uma mensagem para o número; ela aparece em Conversas.

Caminho antigo (só se a tela não puder ser usada): `UAZAPI_TOKEN_<instância>` no arquivo de chaves e
`segredo UAZAPI_TOKEN_<instância>`.

## 2. Inteligência artificial (OpenRouter)

Assistente da equipe (Íris), resumos, sugestões de resposta, leitura de áudio e de comprovante.
Guia: `.htai/guias/openrouter.md`. Chave: `OPENROUTER_API_KEY` → `segredo OPENROUTER_API_KEY`.
O agente de WhatsApp tem teto de gasto por dia (15 dólares, ajustável com `WA_AGENTE_TETO_DIA_USD`).

## 3. E-mails automáticos (Resend)

Avisos e convites. Guia: `.htai/guias/resend.md`. `RESEND_API_KEY` e, para o aviso de contrato assinado,
`NOTIFICA_CONTRATO_EMAIL` → `segredo RESEND_API_KEY NOTIFICA_CONTRATO_EMAIL`. Os e-mails de login usam o
passo `email` do instalador.

## 4. Instagram dos clientes (ScrapeCreators)

Seguidores e postagens dos clientes. Pago por uso. Guia: `.htai/guias/scrapecreators.md`.
`SCRAPECREATORS_API_KEY` → `segredo SCRAPECREATORS_API_KEY`.

## 5. Contrato em PDF (CloudConvert)

Transforma o contrato gerado em Word num PDF. Guia: `.htai/guias/cloudconvert.md`.
`CLOUDCONVERT_API_KEY` → `segredo CLOUDCONVERT_API_KEY`.

## 6. CRM de vendas (ponte Empire)

Envia cada venda fechada para o CRM Empire da empresa. Só faz sentido se a pessoa usa esse CRM.

1. No CRM, o administrador gera o secret da integração.
2. No Desk, **Configurações > Integrações > Empire (CRM de vendas)**: cole o secret, clique em testar.
   O endereço do CRM fica em "Avançado"; preencha com o endereço das funções do CRM dela
   (`https://<projeto>.supabase.co/functions/v1`).
3. Ligue a ponte no banco (num app instalado ela nasce desligada). No painel do Supabase, SQL Editor:
   `update public.integracoes_internas set ligado = true where chave = 'crm_empresa';`
   Para desligar, o mesmo com `false`.
4. Teste: feche uma venda de teste e confira no CRM.

## 7. Íris dentro do GT3

Para quem também tem o GT3 instalado: a Íris do Desk responde dentro do GT3, só com a carteira autorizada.
Precisa dos dois lados.

1. Gere um segredo aleatório (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) e
   guarde-o no arquivo de chaves dos **dois** apps com o nome `IRIS_BRIDGE_SECRET` (o mesmo valor).
2. No Desk: `GT3_SUPABASE_URL` (endereço do Supabase do GT3, `https://<ref>.supabase.co`) e
   `GT3_SUPABASE_ANON_KEY` (chave pública do GT3) no arquivo de chaves, e
   `segredo IRIS_BRIDGE_SECRET GT3_SUPABASE_URL GT3_SUPABASE_ANON_KEY`.
3. No GT3: `IRIS_DESK_URL` = endereço do Supabase do Desk (sem caminho) e o mesmo `IRIS_BRIDGE_SECRET`
   (peça ao Agenor na pasta do GT3).
4. No Desk, **Automações > Íris > Integração GT3**: gere o código de uso único e cole no GT3.

## 8. Importar contratos do Notion

Importação única de contratos de bases do Notion no formato "Contratos" (1 página = 1 contrato; cliente no
título, valor da parcela e número de parcelas). Só administração. Se a base da pessoa tiver outro formato,
peça ao Agenor para adaptar a função `notion-import` antes.

1. A pessoa cria uma integração interna no Notion, compartilha as bases com ela e copia o token.
2. `NOTION_API_KEY` e `NOTION_DB_IDS` (ids das bases, separados por vírgula) no arquivo de chaves →
   `segredo NOTION_API_KEY NOTION_DB_IDS`.
3. Rode a importação chamando a função `notion-import` com a sessão de uma administradora e confira os
   contratos em Contratos.

## O que não vem no app instalado

- Campanhas de chat agendadas, alerta diário do Instagram e entregas da Cami: dependem de tabelas que não estão
  no banco do app.
- Videochamada e resumo de reunião: escondidos (as funções não fazem parte do app).
- Login pela central do HTAI e criação de empresas pela plataforma HTAI: só existem no Desk hospedado.
