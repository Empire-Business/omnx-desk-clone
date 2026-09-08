-- Gerador de contrato via .docx (fidelidade ao Word).
-- Modelos passam a guardar o arquivo .docx (base64) e aceitam várias variantes
-- por produto (ex.: Anual / Semestral / Recorrente).

ALTER TABLE public.contrato_modelos
  ADD COLUMN IF NOT EXISTS variante TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_nome TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_b64 TEXT;

-- Antes havia no máximo um modelo por produto; agora pode haver vários (por variante).
DROP INDEX IF EXISTS idx_contrato_modelos_produto;

-- O texto deixa de ser obrigatório — o arquivo .docx é a fonte do modelo.
ALTER TABLE public.contrato_modelos ALTER COLUMN conteudo DROP NOT NULL;
ALTER TABLE public.contrato_modelos ALTER COLUMN conteudo DROP DEFAULT;

-- Observação: os 9 modelos-base (arquivos em public/modelos-contrato/) são
-- semeados via dados (referenciam products.id de produção) e o arquivo real
-- é servido do bundle até um admin subir uma versão própria (arquivo_b64).
