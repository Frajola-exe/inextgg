# INEXT — loja de keys digitais

Loja responsiva com identidade visual fornecida, categorias Steam, PlayStation, Xbox e Outros, busca, favoritos locais, carrinho, Pix e painel administrativo em `/admin`.

## Stack

React 19 + TypeScript, Vinext (API compatível com Next.js), Cloudflare Workers, D1/SQLite, migrações Drizzle e validação Zod. As operações sensíveis ficam nas rotas de servidor. O banco armazena catálogo, keys, pedidos e configurações; localStorage só guarda favoritos.

## Estado da entrega

A publicação inicial é privada, para revisão do proprietário. O catálogo exibe exclusivamente produtos ativos cadastrados no banco. Se não houver produtos, a vitrine mostra uma mensagem de catálogo vazio. Cadastre edição, região, descrição, preço e keys reais antes de ativá-los.

O administrador da publicação é a conta proprietária configurada em `ADMIN_EMAILS`. Na hospedagem Sites, o login é gerenciado pela plataforma; em desenvolvimento local o starter simula `seedy@sites.test`. Nenhuma senha padrão é criada. A vitrine exige login para finalizar e consultar pedidos. Na Vercel, login e cadastro usam Supabase Auth, conforme a seção de configuração abaixo. Headers de identidade Sites nunca são aceitos diretamente nessa hospedagem.

## Ativar Pix Appmax

A loja usa exclusivamente a API da Appmax. O servidor autentica com credenciais do lojista, cria o cliente e o pedido com produtos digitais e valores em centavos, depois gera o Pix. O checkout coleta nome, sobrenome, telefone, CPF/CNPJ e o IP pelo SDK oficial. O email vem da conta autenticada. CPF/CNPJ e telefone não são gravados no banco da loja nem no armazenamento do navegador.

1. Crie e instale um aplicativo na Appmax e obtenha as credenciais **do lojista (merchant)** e o identificador da instalação.
2. Configure as variáveis protegidas de runtime: `APPMAX_CLIENT_ID`, `APPMAX_CLIENT_SECRET` (secret), `APPMAX_EXTERNAL_ID` e `APPMAX_ENVIRONMENT` (`sandbox` ou `production`). Configure também `ADMIN_EMAILS` e `SITE_URL` com a origem HTTPS da loja. Nenhuma credencial secreta vai para o navegador.
3. Cadastre a URL de webhook `https://SEU-DOMINIO/api/webhooks/pix` na Appmax e habilite os eventos de pedido, incluindo Pix criado, pago, expirado, aprovado, integrado, estorno e chargeback. A URL precisa estar acessível externamente. A audiência atual da loja é restrita; ela precisa ser alterada pelo proprietário antes da homologação de webhooks externos.
4. Publique para aplicar as variáveis. Homologue geração, consulta, aprovação, expiração e estorno no sandbox com as credenciais da Appmax antes de selecionar `production`.
5. Configure o WhatsApp em Administração → Configurações. O Discord fornecido já é o padrão.

O QR Code, o código copia e cola e a expiração vêm da Appmax; a duração não é fixada no site. As datas sem offset retornadas pelo provedor são interpretadas no fuso de Brasília. O servidor consulta `GET /v1/orders/{order_id}` e valida ID do pedido, cliente, email, método Pix, composição do valor e total pago antes de confirmar a entrega. O corpo de um webhook nunca confirma pagamento sozinho: a Appmax não envia assinatura HMAC. A notificação apenas agenda uma consulta autenticada à API, com trabalho persistido no banco antes da resposta HTTP 200. Falhas permanecem na tabela `appmax_webhook_jobs` e podem ser retomadas pela consulta do comprador ou por Pedidos → Consultar provedor.

O checkout reserva as keys em um lote transacional e mantém o mesmo pedido em reenvios com a mesma chave de requisição. Uma trava no banco evita duas chamadas de cobrança concorrentes. A documentação não garante idempotência por header: timeouts, respostas inesperadas ou falhas HTTP 5xx deixam a tentativa como incerta e bloqueiam novas cobranças automáticas. Se o ID Appmax já estiver salvo, a consulta tenta recuperar as instruções Pix; se não estiver, procure o atendimento para conferir a tentativa no painel Appmax. Recusas definitivas antes da criação do Pix devolvem as keys ao estoque; uma nova tentativa precisa reservar todo o carrinho novamente antes de cobrar. A consulta pelo painel também recupera reservas antigas nesse estado seguro (`idle`, sem QR e sem pagamento). Tentativas incertas não são liberadas por timeout local; exigem cancelamento ou rejeição confirmados pela API. O painel de estoque distingue keys disponíveis e reservadas.

A consulta do comprador preserva o pedido e o Pix quando a conferência com a Appmax falha, exibindo aviso e número do pedido. A entrega continua bloqueada enquanto a conferência falhar. A validação aceita centavos inteiros como números ou strings, inclusive com casas decimais zeradas: `"100.00"` representa 100 centavos (R$ 1,00). Não há conversão automática de reais para centavos, arredondamento ou aceitação de frações de centavo. Frete, desconto e taxa de parcelamento ausentes ou nulos são tratados como zero; subtotal e total pago de uma aprovação continuam obrigatórios e devem corresponder exatamente ao pedido. Respostas com `errors: []` ou `errors: {}` e dados válidos são aceitas; erros preenchidos continuam bloqueando a operação. Divergências no painel indicam qual campo não corresponde ao pedido.

Cancelamentos e rejeições são tratados antes da validação completa exigida para entrega: a consulta autenticada deve confirmar o ID Appmax salvo e o status terminal. Se houver um ID de cliente retornado, ele também deve corresponder. Campos ausentes ou alterados de e-mail e composição do valor não impedem a devolução ao estoque. A Appmax pode manter o valor integral do pedido em `total_paid` mesmo quando um Pix está `cancelado`: esse caso é aceito somente com método Pix e valor exatamente igual ao pedido local. Valores inválidos/divergentes, datas de pagamento, identificador Pix liquidado (`end_to_end_id`), estorno registrado, pagamento local ou entrega registrada bloqueiam a devolução. Rejeições continuam exigindo valor zero ou ausente. Ao confirmar o cancelamento sem pagamento, o servidor libera a reserva e apaga as instruções Pix em uma transação; webhooks e consultas do cliente/administrador usam o mesmo fluxo. Falhas na conferência ocultam o QR Code na tela do comprador até nova consulta.

Cancelamentos feitos diretamente no painel Appmax também são recuperados sem depender da chegada de um webhook. Antes de retornar o estoque ou a lista de pedidos, o servidor confere até cinco reservas/falhas por lote e aguarda a atualização do saldo. Uma trava na tabela `settings` limita esses lotes a um a cada 15 segundos entre instâncias; a fila existente alterna os pedidos e aguarda 30 segundos antes de repetir uma consulta pendente ou com falha. A vitrine e o painel atualizam os dados a cada 30 segundos enquanto visíveis e ao receber foco, sem sobrescrever configurações em edição. Sem páginas abertas, o webhook continua sendo o caminho imediato; a próxima consulta recupera cancelamentos que não foram notificados. Não é necessária migração do banco.

O webhook também aceita as notificações `payment_not_authorized` e `payment_authorized_with_delay` do tipo `payment`, além dos eventos de pedido, incluindo `order_pix_expired`. Todas apenas disparam a consulta autenticada do pedido; status e valores recebidos na notificação não autorizam entrega nem devolução de estoque. Uma expiração local, sozinha, não libera keys. O cancelamento com `total_paid: "0.00"` é reconhecido como não pago; repetir a notificação não afeta keys já reservadas para outro pedido.

Pedidos anteriores são identificados como `legacy` pela migração e não são consultados na Appmax. Não há chamadas ao gateway anterior nem fallback. Estes pedidos precisam de conferência externa pelo responsável da loja.

Entrega automática exige a opção global e a opção do produto. Entrega manual só libera keys de pedidos aprovados. Reembolso, contestação ou análise de estorno bloqueiam a consulta às keys. Uma key já copiada não pode ser revogada pelo site. Esta versão não inclui estorno automático, email ou job periódico de reconciliação.

## Desenvolvimento

### PostgreSQL / Supabase na Vercel

O build `npm run build:vercel` conecta as rotas ao PostgreSQL pelo módulo
`lib/postgres.mjs`. Configure `DATABASE_URL` nas variáveis protegidas do servidor
da Vercel com a URI do Supabase Transaction pooler (porta 6543), senha codificada
na URI e TLS com certificado válido.
Baixe o certificado CA em Supabase → Database Settings → SSL Configuration e
configure `DATABASE_SSL_CA` na Vercel com o conteúdo PEM completo, incluindo
`-----BEGIN CERTIFICATE-----` e `-----END CERTIFICATE-----`. São aceitas quebras
de linha reais ou a sequência literal `\n`. Essa CA permite verificar o certificado
do Supabase quando ele não está na lista de autoridades confiáveis do Node.js.
O módulo configura TLS diretamente e remove as opções SSL da URI para evitar
que o driver sobrescreva a CA; a validação de certificado e hostname permanece ativa.
A conexão é criada na primeira requisição e o pool é reutilizado. Não use prefixo
`NEXT_PUBLIC_` para a conexão nem coloque a senha no código.

Para um banco novo e vazio, execute `db/postgresql.sql` uma única vez no SQL Editor
do Supabase. Se já executou `postgres-migration/supabase-setup.sql`, as tabelas já
estão criadas: não execute os dois arquivos. O esquema inclui os campos Appmax e
RLS; as operações passam pelo servidor com a conexão PostgreSQL autorizada.

Em uma loja PostgreSQL existente, aplique `db/product-types-migration.sql` antes
do deploy. Em D1 existente, aplique `drizzle/0002_product_types.sql`. Produtos
anteriores recebem o tipo Key de jogo e preço fixo. Serviços e bots não usam
estoque de keys; itens negociáveis são encaminhados ao atendimento sem Pix automático.

Para versões de jogos, aplique `db/game-versions-migration.sql` em PostgreSQL/Supabase
ou `drizzle/0003_game_versions.sql` em D1 antes do deploy. No cadastro de uma key
de jogo, adicione as versões em **Subcategorias / versões do jogo** com nome, preço
e quantidade obrigatórios. Depois, importe as keys para cada versão na aba Estoque.
A quantidade define o máximo de keys que podem ser importadas; a vitrine mostra
apenas as keys realmente disponíveis. Produtos de key já cadastrados sem versões
continuam com o estoque antigo.

Bots e serviços em **Outros** também aceitam várias opções no mesmo produto.
No painel, informe o nome e o preço de cada opção; se o preço for negociável,
cada opção é identificada no pedido de orçamento. Essas opções não usam estoque
de keys. Em PostgreSQL/Supabase já existente, aplique
`db/product-options-migration.sql` antes de publicar esta versão. O banco novo
já inclui a regra atualizada; em D1, a tabela de versões existente já comporta
essas opções. A migração foi aplicada ao projeto Supabase iNextgg.

Para separar os tipos de key, aplique `db/key-types-migration.sql` em
PostgreSQL/Supabase ou `drizzle/0004_key_types.sql` em D1 antes do deploy. A
migração classifica os produtos existentes pela plataforma: Steam como STEAM KEY,
Xbox como XBOX KEY e PlayStation como PSN KEY. No painel, selecione o tipo de key
ao cadastrar o produto; o estoque e a entrega continuam vinculados a esse produto.
Um produto com keys importadas não pode mudar de tipo.

As reservas usam transações e uma trava compartilhada entre instâncias do servidor.
Essa trava serializa as gravações e pode limitar o volume de pedidos simultâneos.

Depois de configurar a variável e publicar este código, faça um novo deploy na
Vercel e confira `/api/store`. As credenciais D1 da Cloudflare não são usadas
nesse build. O build Sites/Cloudflare continua usando seu binding D1 original.
A configuração de autenticação na Vercel ainda exige um provedor com sessão
validada; a conexão ao banco por si só não habilita login ou administração.

```sh
npm run install:ci
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_wealthy_the_renegades.sql
npm run dev
```

No Windows, se o shim npm falhar, invoque o entrypoint com `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run build` ou `node scripts/run-framework.mjs dev`. Para autorizar somente o administrador local, use um `.dev.vars` ignorado pelo Git com `ADMIN_EMAILS="seedy@sites.test"`. Não use esse endereço como administrador em produção.

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm test
```

Os testes usam Node 24/SQLite em memória e cobrem disputa pela última key, reserva de carrinho inteiro, cálculo de preço, rollback de importação duplicada, validação de pagamento Appmax, extração de notificações, geração de Pix, autenticação e proteção contra cobranças repetidas.

## Organização

- `app/store.tsx`, `app/globals.css`: vitrine e checkout.
- `app/admin/page.tsx`: dashboard, produtos, estoque, pedidos e configurações.
- `app/api/*`: APIs e webhook.
- `lib/server.ts`, `lib/payment.ts`, `lib/inventory.ts`: autenticação, pagamento e reserva.
- `db/schema.ts`, `drizzle/`: banco e migrações versionadas.

## Antes da abertura comercial

Cadastre produtos e estoque reais, confira os direitos de distribuição das keys e as imagens usadas, configure dados comerciais e políticas de atendimento/privacidade, homologue o Pix. Os resultados do dashboard usam pagamentos aprovados e excluem reembolsados/contestados, com limite de 5.000 pedidos mais recentes. A página inicial não exibe avaliações ou estatísticas fictícias.

Documentação do provedor: https://docs.appmax.com.br/api-reference/payments/pix e https://docs.appmax.com.br/guides/webhooks

## Deploy na Vercel

O arquivo `vercel.json` desativa a deteccao automatica de Next.js e executa
`npm run build:vercel`. A configuracao `vite.vercel.config.ts` usa Vinext + Nitro
com o preset `vercel`, que gera o Build Output API em `.vercel/output`.
Nao e necessario gerar `.next/routes-manifest.json`.

Na Vercel, importe este repositorio e remova overrides antigos de Build Command
ou Output Directory (especialmente `.next` e `dist/client`). O build e definido
pelo `vercel.json`; nao selecione o preset Next.js. O Nitro gera o servidor e os
assets para a Vercel. O build padrao `npm run build` e o `vite.config.ts` continuam
sendo usados pela hospedagem Sites/Cloudflare.

Para acessar o mesmo banco D1 pela Vercel, configure somente no servidor:

- `CLOUDFLARE_ACCOUNT_ID`: ID da conta Cloudflare.
- `CLOUDFLARE_D1_DATABASE_ID`: ID do banco existente, com as migracoes aplicadas.
- `CLOUDFLARE_D1_API_TOKEN`: token Cloudflare com permissao D1 Edit para essa conta.
- As variaveis Appmax, `ADMIN_EMAILS` e `SITE_URL` descritas acima.

O adaptador `lib/d1-http.mjs` envia cada batch em uma unica chamada ao D1, sem
repetir escritas automaticamente. Os webhooks usam `waitUntil` da Vercel.
O deploy nao cria nem migra bancos automaticamente.

### Login e cadastro com Supabase Auth

A loja tem `/entrar` e `/cadastro`, com nome, e-mail, senha e confirmação de senha.
O cadastro envia a confirmação de e-mail pelo Supabase; após confirmar, o cliente
entra com e-mail e senha. O header mostra Entrar/Criar conta para visitantes e Sair
para usuários autenticados. O botão Painel admin aparece somente quando o servidor
confirma que a conta está em `ADMIN_EMAILS`. O rodapé não contém acesso ao painel.

Configure na hospedagem (ou em `.env` para Vercel local / `.dev.vars` para Sites local):

- `SUPABASE_URL`: URL HTTPS do projeto, por exemplo `https://SEU-PROJETO.supabase.co`.
- `SUPABASE_ANON_KEY`: chave publishable (`sb_publishable_...`) ou chave anon do
  mesmo projeto. Não use a chave `service_role` nem a chave secret.
- `SITE_URL`: origem HTTPS da loja publicada, sem caminho.
- `ADMIN_EMAILS`: e-mails administrativos separados por vírgula. Cadastre e confirme
  a conta correspondente antes de tentar entrar no painel.

No painel Supabase:

1. Em Authentication / Sign In / Providers, habilite Email e **Confirm email**.
   Mantenha a confirmação habilitada: a permissão admin depende de um e-mail
   verificado pelo provedor. Não permita que visitantes escolham os administradores.
2. Em Authentication / URL Configuration, use a origem da loja como Site URL e
   adicione `https://SEU-DOMINIO/entrar` à lista Redirect URLs. No desenvolvimento,
   adicione também `http://localhost:5173/entrar` se essa for a porta utilizada.
3. Preserve o link padrão `{{ .ConfirmationURL }}` no template Confirm signup.
   O usuário confirma o e-mail e retorna a `/entrar`. Os tokens do fragmento da URL
   são descartados; o login por senha cria a sessão em cookies HttpOnly.
4. Configure SMTP próprio em Authentication / Email para enviar confirmações aos
   clientes. O envio padrão do Supabase é limitado e não serve à abertura pública.
5. Configure a política de senha para ao menos 12 caracteres e mantenha os limites
   de tentativas do Supabase ativos. A tela de cadastro também exige 12 caracteres.

Não é necessária migração das tabelas de comércio: as contas ficam no Supabase Auth.
Pedidos novos usam o ID estável `supabase:<id>`; contas Sites e Supabase têm IDs
separados. Pedidos antigos da conta ChatGPT continuam ligados àquela identidade e
não são transferidos por coincidência de e-mail.

Os tokens de acesso e renovação são mantidos somente em cookies HttpOnly, SameSite=Lax
(e Secure em produção), com renovação validada no servidor. Login, cadastro e saída
exigem a origem da loja; o navegador não recebe tokens no JSON. O Supabase valida
a sessão pelo endpoint `/user`; permissões em `user_metadata` são ignoradas.

A integração de identidade Sites foi preservada (Entrar com ChatGPT na hospedagem
Sites). Na Vercel, headers Sites continuam sendo ignorados: a autenticação depende
do Supabase. Sem as variáveis acima, o formulário informa indisponibilidade e não
cria sessões. A configuração do provedor e o envio real de e-mails precisam ser
validados na hospedagem antes de abrir a loja.

Validacao local:

```sh
npm run build:vercel
node --test tests/d1-http.test.mjs
npm test
```
