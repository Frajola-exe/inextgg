import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesCategory, otherSubcategories } from '../lib/catalog.ts';

test('Outros mostra serviços digitais e bots Discord em suas subcategorias', () => {
 const service={category:'Outros',product_type:'service'};
 const bot={category:'Outros',product_type:'bot'};
 const key={category:'Outros',product_type:'key'};
 const steam={category:'Steam',product_type:'key'};
 assert.deepEqual(Object.values(otherSubcategories),['Serviços digitais','Bots Discord']);
 assert.deepEqual([service,bot,key,steam].filter(p=>matchesCategory(p,'Outros')),[service,bot,key]);
 assert.deepEqual([service,bot,key,steam].filter(p=>matchesCategory(p,'Outros','service')),[service]);
 assert.deepEqual([service,bot,key,steam].filter(p=>matchesCategory(p,'Outros','bot')),[bot]);
 assert.deepEqual([service,bot,key,steam].filter(p=>matchesCategory(p,'Steam')),[steam]);
});
