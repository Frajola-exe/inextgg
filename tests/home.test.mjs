import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryHighlights, categoryProducts, selectCarouselGames } from '../lib/home.ts';
import { categoryPath } from '../lib/catalog.ts';

const product = (id, category='Steam', product_type='key', stock=1) => ({
 id, name:id, category, product_type, stock, price_mode:'fixed', price:1000,
});

test('each category contains only its own products and has a dedicated route', () => {
 const products=[product('steam'),product('ps','PlayStation'),product('xbox','Xbox'),product('other','Outros'),product('service','Outros','service'),product('bot','Outros','bot')];
 for(const [category,ids,path] of [
  ['Steam',['steam'],'/plataforma/steam'],['PlayStation',['ps'],'/plataforma/playstation'],
  ['Xbox',['xbox'],'/plataforma/xbox'],['Outros',['other','service','bot'],'/plataforma/outros'],
  ['Serviços',['service'],'/categoria/servicos'],['Bots',['bot'],'/categoria/bots'],
 ]) {
  assert.deepEqual(categoryProducts(products,category).map(item=>item.id),ids);
  assert.equal(categoryPath(category),path);
 }
 assert.deepEqual(categoryProducts(products,'Outros','service').map(item=>item.id),['service']);
 assert.deepEqual(categoryProducts(products,'Outros','bot').map(item=>item.id),['bot']);
});

test('carousel includes games without stock but excludes services and bots', () => {
 const games=[product('a'),product('b','Xbox'),product('sold','Steam','key',0),product('service','Outros','service'),product('bot','Outros','bot')];
 const selected=selectCarouselGames(games,[],3,()=>0);
 assert.equal(selected.length,2);
 assert.ok(selected.every(item=>item.product_type==='key'));
 assert.ok(selected.some(item=>item.id==='sold'));
});

test('home highlights keep games visible when stock runs out', () => {
 const games=[product('sold','Steam','key',0),product('available'),product('other','Xbox')];
 assert.deepEqual(categoryHighlights(games,'Steam').map(item=>item.id),['sold','available']);
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
