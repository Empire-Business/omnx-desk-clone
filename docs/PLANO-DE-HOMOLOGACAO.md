# Plano de homologação — OMNX Desk

> Atualizado em: 06/08/2026 às 12h00 BRT
> O que precisa ser verificado, por quem e em que ordem, antes de uma entrega
> chegar em produção.

---

## Onde se homologa

**Na URL de preview do Vercel**, gerada automaticamente para cada branch que não
é `main`. Nunca em produção, nunca só na máquina de quem programou.

O preview aponta para o **mesmo banco de produção**. Isso tem uma consequência
que precisa estar clara para quem testa:

> ⚠️ **O que você criar no preview é dado real.** Use um cliente de teste
> identificável (ex.: "ZZ Teste homologação") e apague depois. Não teste em
> contrato ou conversa de cliente de verdade.

---

## Quem homologa

Quem testa **não pode ser quem implementou** (§17 do brief). Quem escreveu o
código já sabe o caminho certo — e é justamente o caminho errado que precisa ser
descoberto.

| Papel | Testa |
|---|---|
| Dono do produto | O fluxo faz sentido para o negócio? |
| Alguém da operação | Consegue fazer sem instrução? |
| Admin da conta | Permissões e ligar/desligar app |

---

## Roteiro fixo (toda entrega)

Independente do que mudou — regressão barata que pega quebra grande:

- [ ] Entrar com um usuário de cada perfil em uso: `admin`, `gerente`,
      `estrategista`, `atendimento`
- [ ] Tela inicial carrega sem erro em todos eles
- [ ] Abrir cada app ligado e navegar por todas as abas
- [ ] Criar, editar e concluir uma demanda de teste
- [ ] Abrir uma conversa no Chat e enviar uma mensagem de teste
- [ ] Abrir um contrato e uma parcela
- [ ] Reportar um problema de teste e ver o protocolo aparecer em `/reportes`
- [ ] Verificar `/saude`: a navegação acima não pode ter gerado erro novo

---

## Roteiros por tipo de mudança

### Mudou permissão ou autenticação

- [ ] Cada perfil vê **exatamente** o que via antes (a menos que a mudança seja
      justamente essa — e aí, o que mudou está escrito na entrega?)
- [ ] Ninguém foi promovido sem querer: `estrategista` continua vendo só os
      clientes dele
- [ ] Tela protegida não abre digitando a URL direto
- [ ] A API também barra: sem permissão, a lista volta vazia — e não "cheia, mas
      escondida na tela"

### Mudou banco (migration)

- [ ] Migration aplicada no preview antes do teste
- [ ] RLS ativa na tabela nova (`tenant_id` + policy de isolamento)
- [ ] Comando de rollback existe no cabeçalho da migration
- [ ] Dados antigos continuam legíveis (a mudança não quebrou o que já existia)

### Mudou integração (CRM, e-mail, Clicksign)

- [ ] O caminho feliz funciona ponta a ponta
- [ ] A falha é registrada em algum lugar visível (não falha em silêncio)
- [ ] A falha da integração **não** impede a operação principal de salvar

### Mudou app ligável

- [ ] Desligar tira do menu e bloqueia a rota
- [ ] Religar devolve os dados intactos
- [ ] Desligar numa empresa não afeta a outra

---

## Teste de isolamento entre empresas — obrigatório

Com duas empresas em produção no mesmo banco, este é o teste que mais importa:

- [ ] Entrar como admin da empresa A e listar clientes, contratos, conversas,
      demandas e reportes
- [ ] Entrar como admin da empresa B e repetir
- [ ] **Nenhum registro da A aparece na B, e vice-versa**
- [ ] Abrir a URL de um registro da A logado como B → não abre

> Este teste ainda é **manual**. Automatizá-lo é a maior lacuna aberta do
> projeto: hoje um vazamento entre empresas só apareceria se alguém percebesse.

---

## Critério de aprovação

A entrega passa quando:

1. O roteiro fixo passou inteiro.
2. O roteiro do tipo de mudança passou inteiro.
3. `npm run typecheck` passou (uma vez, antes do merge).
4. Nenhum teste existente quebrou.
5. Quem testou **não** foi quem implementou.
6. Os problemas encontrados foram corrigidos ou registrados por escrito com a
   decisão de seguir assim mesmo.

O item 6 é o que separa homologação de encenação: problema conhecido e aceito é
decisão; problema conhecido e não escrito é dívida que ninguém lembra de cobrar.

---

## Depois do deploy

- [ ] Abrir o site em produção e repetir 3 itens do roteiro fixo
- [ ] Olhar `/saude` nas primeiras horas — pico de erro logo após o deploy é o
      sinal mais rápido de que algo passou
- [ ] Apagar os dados de teste criados no preview
