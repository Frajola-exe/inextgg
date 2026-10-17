import { test } from 'node:test';
import assert from 'node:assert/strict';
import { available, matchesCategory, serviceSubcategories } from '../lib/catalog.ts';

test('Serviços mostra serviços digitais e bots Discord em suas subcategorias', () => {
 const service={category:'Serviços',product_type:'service'};
 const bot={category:'Serviços',product_type:'bot'};
 const steam={category:'Steam',product_type:'key'};
 assert.deepEqual(Object.values(serviceSubcategories),['Serviços digitais','Bots Discord']);
 assert.deepEqual([service,bot,steam].filter(p=>matchesCategory(p,'Serviços')),[service,bot]);
 assert.deepEqual([service,bot,steam].filter(p=>matchesCategory(p,'Serviços','service')),[service]);
 assert.deepEqual([service,bot,steam].filter(p=>matchesCategory(p,'Serviços','bot')),[bot]);
 assert.deepEqual([service,bot,steam].filter(p=>matchesCategory(p,'Steam')),[steam]);
});

test('Em breve bloqueia compras mesmo com estoque e preço definidos', () => {
 const upcoming={category:'Steam',product_type:'key',stock:3,coming_soon:1};
 assert.equal(matchesCategory(upcoming,'Em breve'),true);
 assert.equal(matchesCategory(upcoming,'Steam'),false);
 assert.equal(available(upcoming),false);
});
