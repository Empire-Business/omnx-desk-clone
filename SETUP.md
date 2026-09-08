# Como rodar essa plataforma

Guia pra quem clonou esse template pelo HTIA2 (ou direto pelo GitHub via **Use this template**). Não precisa abrir terminal.

---

## 1. Crie um projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) → **New Project**
2. Anote a senha do banco — você só vê **uma vez**
3. Espere o projeto ficar verde (`ACTIVE_HEALTHY`, ~2 min)
4. Em **Settings → API**, copie:
   - **Project URL** → vai virar `VITE_SUPABASE_URL`
   - **anon public** → vai virar `VITE_SUPABASE_ANON_KEY`

---

## 2. Aplique o schema do app

1. No painel do Supabase, abra **SQL Editor**
2. Abra o arquivo `supabase/SETUP_COMPLETE.sql` desse repo
3. Cole tudo no editor e clique em **Run**
4. Resposta esperada: **Success. No rows returned.** sem nenhum erro

> Se der erro de "relation already exists", o banco não está vazio — rode primeiro:
> ```sql
> DROP SCHEMA public CASCADE;
> CREATE SCHEMA public;
> GRANT ALL ON SCHEMA public TO postgres, public;
> ```
> e cole o `SETUP_COMPLETE.sql` de novo.

---

## 3. Ajuste o Site URL do Supabase Auth

Em **Authentication → URL Configuration**:

- **Site URL** → URL do seu Vercel (ex: `https://meu-app.vercel.app`)
- **Redirect URLs** → adicione `https://meu-app.vercel.app/**` (com `/**` no fim)

Sem isso, links de confirmação de e-mail caem em `localhost`.

---

## 4. Faça deploy no Vercel

1. [vercel.com/new](https://vercel.com/new) → importe o repo do GitHub
2. Em **Environment Variables**, preencha:
   - `VITE_APP_NAME` → nome temporário (pode mudar depois na tela Marca)
   - `VITE_SUPABASE_URL` → (do passo 1)
   - `VITE_SUPABASE_ANON_KEY` → (do passo 1)
   - `VITE_SITE_URL` → URL do Vercel (a mesma do passo 3)
3. **Deploy** → espera ficar **Ready** (~1-2 min)

---

## 5. Crie seu usuário admin

1. Abra a URL do Vercel
2. Vá em **Criar conta** e cadastre com seu e-mail
3. O primeiro user do banco vira **admin automaticamente** (trigger `handle_new_user`)
4. Faça login

---

## 6. Personalize sua marca

Dentro do app, em **Configurações → Marca**:

- Nome da empresa
- Cor primária (hex)
- Logo claro e escuro
- Favicon
- (Opcional) Domínio próprio — aponte um CNAME pra `cname.vercel-dns.com`

Salvou → atualiza em runtime, sem precisar redeploy.

---

## ⚠️ Importante

- **NUNCA** commit o `.env` (ele já está no `.gitignore`)
- A `SUPABASE_SERVICE_ROLE_KEY` **nunca** vai no front nem no `.env` — ela mora apenas em **Edge Functions → Secrets** no Supabase
- Token do Supabase CLI (`supabase login`) expira em 7 dias — renove se precisar rodar migrations no terminal

---

## Suporte

- Issues / dúvidas: abra uma issue nesse repo
- Documentação: [docs/](./docs/)
