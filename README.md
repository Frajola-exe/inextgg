# INEXT — loja de keys digitais

Loja responsiva com identidade visual fornecida, categorias Steam, PlayStation, Xbox e Outros, busca, favoritos locais, carrinho, Pix e painel administrativo em `/admin`.

## Stack

React 19 + TypeScript, Vinext (API compatível com Next.js), Cloudflare Workers, D1/SQLite, migrações Drizzle e validação Zod. As operações sensíveis ficam nas rotas de servidor. O banco armazena catálogo, keys, pedidos e configurações; localStorage só guarda favoritos.

## Estado da entrega

A publicação inicial é privada, para revisão do proprietário. O catálogo vazio exibe exemplos claramente marcados, sem gerar pagamentos. Importar exemplos no painel cria produtos INATIVOS, sem estoque. Cadastre edição, região, descrição, preço e keys reais antes de ativá-los.

O administrador da publicação é a conta proprietária configurada em `ADMIN_EMAILS`. Na hospedagem Sites, o login é gerenciado pela plataforma; em desenvolvimento local o starter simula `seedy@sites.test`. Nenhuma senha padrão é criada. A vitrine exige login para finalizar e consultar pedidos. Para usar outra hospedagem/autenticação, adapte `app/chatgpt-auth.ts` e o controle de acesso; headers de identidade nunca devem ser aceitos diretamente em um servidor público sem o proxy confiável da plataforma.

## Ativar Pix Appmax

A loja usa exclusivamente a API da Appmax. O servidor autentica com credenciais do lojista, cria o cliente e o pedido com produtos digitais e valores em centavos, depois gera o Pix. O checkout coleta nome, sobrenome, telefone, CPF/CNPJ e o IP pelo SDK oficial. O email vem da conta autenticada. CPF/CNPJ e telefone não são gravados no banco da loja nem no armazenamento do navegador.

1. Crie e instale um aplicativo na Appmax e obtenha as credenciais **do lojista (merchant)** e o identificador da instalação.
2. Configure as variáveis protegidas de runtime: `APPMAX_CLIENT_ID`, `APPMAX_CLIENT_SECRET` (secret), `APPMAX_EXTERNAL_ID` e `APPMAX_ENVIRONMENT` (`sandbox` ou `production`). Configure também `ADMIN_EMAILS` e `SITE_URL` com a origem HTTPS da loja. Nenhuma credencial secreta vai para o navegador.
3. Cadastre a URL de webhook `https://SEU-DOMINIO/api/webhooks/pix` na Appmax e habilite os eventos de pedido, incluindo Pix criado, pago, expirado, aprovado, integrado, estorno e chargeback. A URL precisa estar acessível externamente. A audiência atual da loja é restrita; ela precisa ser alterada pelo proprietário antes da homologação de webhooks externos.
4. Publique para aplicar as variáveis. Homologue geração, consulta, aprovação, expiração e estorno no sandbox com as credenciais da Appmax antes de selecionar `production`.
5. Configure WhatsApp e URL HTTPS do instalador em Administração → Configurações. O Discord fornecido já é o padrão.

O QR Code, o código copia e cola e a expiração vêm da Appmax; a duração não é fixada no site. As datas sem offset retornadas pelo provedor são interpretadas no fuso de Brasília. O servidor consulta `GET /v1/orders/{order_id}` e valida ID do pedido, cliente, email, método Pix, composição do valor e total pago antes de confirmar a entrega. O corpo de um webhook nunca confirma pagamento sozinho: a Appmax não envia assinatura HMAC. A notificação apenas agenda uma consulta autenticada à API, com trabalho persistido no banco antes da resposta HTTP 200. Falhas permanecem na tabela `appmax_webhook_jobs` e podem ser retomadas pela consulta do comprador ou por Pedidos → Consultar provedor.

O checkout reserva as keys em um lote transacional e mantém o mesmo pedido em reenvios com a mesma chave de requisição. Uma trava no banco evita duas chamadas de cobrança concorrentes. A documentação não garante idempotência por header: timeouts, respostas inesperadas ou falhas HTTP 5xx deixam a tentativa como incerta e bloqueiam novas cobranças automáticas. Se o ID Appmax já estiver salvo, a consulta tenta recuperar as instruções Pix; se não estiver, procure o atendimento para conferir a tentativa no painel Appmax. Reservas não são liberadas por timeout local; apenas após cancelamento ou rejeição confirmados pela API.

Pedidos anteriores são identificados como `legacy` pela migração e não são consultados na Appmax. Não há chamadas ao gateway anterior nem fallback. Estes pedidos precisam de conferência externa pelo responsável da loja.

Entrega automática exige a opção global e a opção do produto. Entrega manual só libera keys de pedidos aprovados. Reembolso, contestação ou análise de estorno bloqueiam a consulta às keys. Uma key já copiada não pode ser revogada pelo site. Esta versão não inclui estorno automático, email ou job periódico de reconciliação.

## Desenvolvimento

### PostgreSQL / Supabase na Vercel

O build `npm run build:vercel` conecta as rotas ao PostgreSQL pelo módulo
`lib/postgres.mjs`. Configure `DATABASE_URL` nas variáveis protegidas do servidor
da Vercel com a URI do Supabase Transaction pooler (porta 6543), senha codificada
na URI e TLS com certificado válido. Use `.env.example` como referência.
A conexão é criada na primeira requisição e o pool é reutilizado. Não use prefixo
`NEXT_PUBLIC_` para a conexão nem coloque a senha no código.

Para um banco novo e vazio, execute `db/postgresql.sql` uma única vez no SQL Editor
do Supabase. Se já executou `postgres-migration/supabase-setup.sql`, as tabelas já
estão criadas: não execute os dois arquivos. O esquema inclui os campos Appmax e
RLS; as operações passam pelo servidor com a conexão PostgreSQL autorizada.
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

Cadastre produtos e estoque reais, confira os direitos de distribuição das keys e as imagens usadas, configure dados comerciais e políticas de atendimento/privacidade, disponibilize o instalador oficial e homologue o Pix. As imagens remotas de jogos são demonstrativas. Os resultados do dashboard usam pagamentos aprovados e excluem reembolsados/contestados, com limite de 5.000 pedidos mais recentes. A página inicial não exibe avaliações ou estatísticas fictícias.

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

### Limite de autenticacao na Vercel

O login ChatGPT existente pertence a hospedagem Sites e nao e fornecido pela
Vercel. Nessa hospedagem, `getChatGPTUser()` retorna `null` para impedir que um
visitante forje os headers de identidade. A vitrine/API publica pode acessar D1
apos configurar as variaveis, mas checkout, pedidos e administracao exigem integrar
um provedor de autenticacao com sessao verificada no servidor. Adicionar apenas
`ADMIN_EMAILS` nao habilita login. A autenticacao na hospedagem Sites e preservada.

Validacao local:

```sh
npm run build:vercel
node --test tests/d1-http.test.mjs
npm test
```
