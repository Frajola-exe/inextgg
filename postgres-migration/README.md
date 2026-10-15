# Adaptação INEXT para PostgreSQL

Este pacote foi preparado a partir dos dois arquivos compilados disponíveis em 14/10/2026. Ambos contêm o mesmo esquema D1. Ele não é uma aplicação completa para publicar na Vercel: o código-fonte original não está nesta pasta, e os pacotes continuam sendo builds de Cloudflare Workers.

## Conteúdo

- `migrations/0001_postgresql.sql`: tabelas, referências e índices PostgreSQL.
- `src/db.mjs`: conexão PostgreSQL usando `pg` e `DATABASE_URL`.
- `src/adapter.mjs`: compatibilidade com as operações `prepare().bind().first()/all()/run()` e `batch()` encontradas nas rotas compiladas.
- `scripts/migrate.mjs`: aplica a estrutura em uma transação e registra checksum; executar novamente não recria as tabelas.
- `scripts/import-data.mjs`: importa uma exportação JSON das quatro tabelas, sem sobrescrever registros.

## Integrar ao código-fonte

1. Copie `src/db.mjs` e `src/adapter.mjs` para o módulo de servidor do projeto, ajustando o caminho do import.
2. Instale `pg` no projeto (`npm install pg`). Use runtime Node.js nas rotas da Vercel, por exemplo `export const runtime = 'nodejs'` em rotas Next.js.
3. Substitua a função que retorna `env.DB` por uma importação de `db` deste pacote. As chamadas existentes a `db().prepare(...)` e `db().batch(...)` podem continuar.
4. Nas rotas do catálogo, pedidos, administração, webhook e no módulo de servidor, remova o import de `env` de `cloudflare:workers`. Use `process.env.MP_ACCESS_TOKEN`, `process.env.MP_WEBHOOK_SECRET`, `process.env.SITE_URL` e `process.env.ADMIN_EMAILS` nos pontos correspondentes. Não exponha esses valores no cliente.
5. Configure `DATABASE_URL` e as demais variáveis no ambiente do servidor/Vercel. Use a URL e TLS indicados pelo provedor; o adaptador não desativa a validação de certificados. Prefira uma URL com pooling para ambientes serverless.
6. Reconstrua o projeto para a Vercel. Não edite nem publique os chunks compilados como se fossem código-fonte.

Os nomes das rotas e arquivos-fonte originais não podem ser determinados com segurança pelos chunks. O módulo compartilhado foi identificado no build como `server-_t_a6SeT.js`, e as operações aparecem nas rotas de catálogo, pedidos, administração e webhook.

### Autenticação ainda precisa ser integrada

A autenticação encontrada lê os cabeçalhos `oai-authenticated-user-*`, preenchidos pelo ambiente original. Na Vercel, substitua essa leitura por uma sessão validada no servidor. Não aceite esses cabeçalhos enviados pelo navegador como identidade. Essa etapa depende do provedor de autenticação escolhido e do código-fonte original.

## Criar a estrutura

Dentro desta pasta:

```powershell
npm.cmd ci
$env:DATABASE_URL = 'URL_FORNECIDA_PELO_PROVEDOR'
npm.cmd run migrate
```

Execute em um banco novo. Se tabelas de mesmo nome já existirem, a migração falha e reverte a transação em vez de assumir que são compatíveis. Não configure essa migração para executar em toda requisição.

## Transferir registros existentes

Os arquivos disponíveis contêm apenas `CREATE TABLE`; nenhum registro real foi incluído. Exporte do D1 todas as colunas das tabelas `products`, `orders`, `keys`, `settings` como arrays em um único JSON:

```json
{"products":[],"orders":[],"keys":[],"settings":[]}
```

Preencha os arrays com os registros exportados, mantendo `items` e `value` como texto JSON, flags como 0/1, valores monetários como centavos e datas como números de milissegundos. Campos opcionais sem valor devem ser `null`, e todas as colunas devem estar presentes. O exemplo vazio apenas ilustra o formato; não transfere dados.

```powershell
node scripts/import-data.mjs exports/d1.json
```

A importação insere produtos, pedidos, chaves e configurações nessa ordem, em uma transação. Uma duplicação ou referência inválida reverte o lote. Ela não usa `ON CONFLICT` para apagar ou sobrescrever dados existentes. Interrompa gravações no banco antigo durante a exportação final e troca de conexão para não perder pedidos entre as etapas.

## Decisões de compatibilidade

- IDs continuam `text`, pois o projeto não exige UUID em todas as tabelas.
- JSON continua `text`, preservando os `JSON.parse()` atuais.
- Flags continuam inteiros 0/1, preservando filtros e validações existentes.
- Datas usam `bigint`: `Date.now()` excede o limite de `integer` PostgreSQL. O adaptador devolve datas e contagens como números JavaScript seguros.
- Valores monetários continuam centavos inteiros.
- Toda gravação via adaptador adquire a mesma trava transacional PostgreSQL. O lote de checagem de estoque e reserva não pode disputar a mesma chave com outro lote via adaptador. Isso serializa gravações e favorece correção para a loja atual; limita o throughput de gravações. Escritas que contornem o adaptador também devem respeitar essa trava.
- Transações usam a mesma conexão, com rollback e liberação no erro.

## Validação

```powershell
npm.cmd test
```

Os testes validam SQL e constraints com PostgreSQL embarcado (PGlite), reserva com estoque insuficiente, rollback, referências, tipos retornados e parametrização. A ordem das operações de trava é testada com uma conexão simulada. Concorrência entre instâncias e conexão/TLS com um provedor externo precisam ser verificadas em um PostgreSQL real antes da publicação.

Referências: https://node-postgres.com/features/transactions e https://www.postgresql.org/docs/current/explicit-locking.html
