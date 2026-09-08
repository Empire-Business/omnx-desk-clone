# Manual de administração — OMNX Desk

> Atualizado em: 06/08/2026 às 12h00 BRT
> Para quem administra uma conta (empresa) no Desk: cria pessoas, liga apps,
> define quem vê o quê. Operação do dia a dia está no
> [Manual do usuário](MANUAL-DO-USUARIO.md).

---

## Os quatro controles que você tem

Eles são independentes e se combinam em **E**. Uma tela só aparece quando os
quatro deixam passar — é por isso que "dei permissão e continua sumido"
normalmente é o app desligado, não a permissão.

| Controle | Onde | Pergunta que responde |
|---|---|---|
| **Apps ligados** | `/apps` | Esta empresa usa este app? |
| **Permissões** | `/admin` | Este perfil pode agir neste recurso? |
| **Perfil da pessoa** | `/colaboradores` | Que papel ela exerce? |
| **Empresa (tenant)** | automático | De qual empresa é este dado? |

O quarto não tem tela porque não se configura: cada dado nasce carimbado com a
empresa e o banco impede que uma empresa leia dados de outra.

---

## Pessoas

### Criar

`Colaboradores → Novo`. A pessoa nasce com a senha padrão **Desk@2026** e o
e-mail já confirmado — ela entra direto e troca a senha no primeiro acesso.

> A senha padrão é conveniência, não segurança. Enquanto a pessoa não trocar,
> qualquer um que conheça o padrão pode entrar com o e-mail dela. Cobre a troca.

### Perfis

| Perfil | Uso típico |
|---|---|
| `admin` | Dono da conta. Passa por qualquer permissão, sempre |
| `gerente` | Gestão: vê a carteira inteira, atribui responsável |
| `estrategista` | Atende os clientes atribuídos a si |
| `atendimento` | Fila de atendimento; vê os clientes, não todas as conversas |
| `cliente` | Acesso externo (Portal) |

O `admin` passa por tudo por desenho: é o fail-safe que impede uma configuração
errada de trancar o dono para fora da própria conta.

---

## Apps (`/apps`)

Ligue e desligue o que a empresa usa. Desligar:

- tira o app do menu;
- bloqueia a rota (não abre nem digitando a URL);
- **não apaga nada** — religar devolve tudo como estava.

Fica registrado quem ligou ou desligou e quando.

---

## Permissões (`/admin`)

A matriz é **perfil × recurso × ação**. As ações são uma escada:
`admin` ⊃ `editar` ⊃ `ver` — quem pode editar, pode ver.

Recursos que valem explicação, porque não são "abre a tela?":

| Recurso | O que decide de verdade |
|---|---|
| `clientes.carteira` | Ver **todos** os clientes ou só os atribuídos à pessoa |
| `chat.carteira` | Ver **todas** as conversas ou só as dos seus clientes |
| `clientes.atribuir` | Poder definir quem é o estrategista/atendente de um cliente |
| `contratos.onboarding` | Só a aba de vendas novas, sem o resto de Contratos |

> Antes de 06/08/2026 essas quatro regras estavam fixas no código como
> "admin ou gerente". Passaram para a matriz sem que ninguém ganhasse ou perdesse
> acesso — o seed reproduziu exatamente quem já tinha. Agora dá para delegar sem
> promover a pessoa a administrador.

A tela `/admin` continua exclusiva de `admin`, de propósito: é a tela que edita a
própria matriz. Delegá-la permitiria a alguém se auto-promover.

---

## Ramo da empresa

`Configurações → Ramo da empresa`. Define o vocabulário, as abas e os indicadores
do Atendimento (Social Media, Clínica, Escritório).

Trocar o ramo é **aditivo**: as etapas e os tipos do ramo novo entram junto dos
que já existem. Nada do que foi registrado se perde.

---

## Reportes de erro (`/reportes`)

Cada problema reportado chega com print da tela, rota, navegador e o rastro
técnico do momento. Você tria: status, prioridade, nota interna (privada) e
resposta ao usuário (que ele vê em "Meus reportes").

Desde 06/08/2026, todo reporte de **categoria bug** dispara e-mail para os
administradores da empresa. Dúvida e sugestão não disparam — canal de alerta que
avisa demais deixa de ser lido.

---

## Saúde do sistema (`/saude`)

Erros registrados por app nas últimas 24h, 7 ou 30 dias, mais os últimos erros
com tela e mensagem.

É complementar aos reportes: o reporte é o que a **pessoa viu**; a saúde é o que
o **sistema sentiu**, inclusive quando ninguém reclamou. Erro que ninguém reporta
(porque a pessoa desistiu e fechou a tela) aparece aqui.

---

## O que NUNCA fazer

- **Colocar a `service_role_key` no `.env`, no código ou em qualquer arquivo
  versionado.** Ela ignora toda a segurança do banco. Se aparecer em algum lugar,
  pare tudo e remova.
- **Rodar SQL direto no painel do Supabase.** Toda mudança de banco vai por
  migration versionada — senão o próximo deploy desfaz, ou o histórico
  dessincroniza e nenhuma migration nova sobe.
- **Commitar `.env`.** Está no `.gitignore`; mantenha assim.
