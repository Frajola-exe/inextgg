import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryProducts, selectCarouselGames } from '../lib/home.ts';
import { categoryPath } from '../lib/catalog.ts';

const product = (id, category='Steam', product_type='key', stock=1) => ({
 id, name:id, category, product_type, stock, price_mode:'fixed', price:1000,
});

test('each category contains only its own products and has a dedicated route', () => {
 const products=[product('steam'),product('ps','PlayStation'),product('xbox','Xbox'),product('other','Outros'),product('service','Outros','service'),product('bot','Outros','bot')];
 for(const [category,id,path] of [
  ['Steam','steam','/plataforma/steam'],['PlayStation','ps','/plataforma/playstation'],
  ['Xbox','xbox','/plataforma/xbox'],['Outros','other','/plataforma/outros'],
  ['Serviços','service','/categoria/servicos'],['Bots','bot','/categoria/bots'],
 ]) {
  assert.deepEqual(categoryProducts(products,category).map(item=>item.id),[id]);
  assert.equal(categoryPath(category),path);
 }
});

test('carousel excludes services, bots and games without stock', () => {
 const games=[product('a'),product('b','Xbox'),product('sold','Steam','key',0),product('service','Outros','service'),product('bot','Outros','bot')];
 assert.equal(selectCarouselGames(games,[],3,()=>0).length,1);
 assert.ok(['a','b'].includes(selectCarouselGames(games,[],3,()=>0)[0].id));
});

test('carousel changes its selection on reload when more games are available than slides', () => {
 const games=['a','b','c','d','e'].map(id=>product(id));
 const first=selectCarouselGames(games,[],3,()=>0.5);
 const second=selectCarouselGames(games,first.map(item=>item.id),3,()=>0.5);
 assert.equal(first.length,3);
 assert.equal(second.length,3);
 assert.notDeepEqual(new Set(first.map(item=>item.id)),new Set(second.map(item=>item.id)));
});

test('small catalogs still change the featured game on reload', () => {
 const games=[product('a'),product('b'),product('c')];
 const first=selectCarouselGames(games,[],3,()=>0);
 const second=selectCarouselGames(games,first.map(item=>item.id),3,()=>0);
 assert.equal(first.length,2);
 assert.equal(second.length,2);
 assert.notDeepEqual(new Set(first.map(item=>item.id)),new Set(second.map(item=>item.id)));
});
