import { describe, expect, it } from 'vitest';
import { publishedA } from '../e2e/fixtures/publication';
import { readPublicationPreview, savePublicationPreview } from './publication-preview';
function memory() { const values=new Map<string,string>(); return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}}; }
describe('local publication preview',()=>{
 it('roundtrips a validated embedded event without a public manifest',()=>{
  const storage=memory();const token=savePublicationPreview(publishedA,storage);
  expect(readPublicationPreview(token,storage)).toEqual(publishedA);
 });
 it('reports missing preview and rejects arbitrary storage key access',()=>{
  expect(()=>readPublicationPreview('missing',memory())).toThrow();
  expect(()=>readPublicationPreview('../private',memory())).toThrow();
 });
 it('reports storage quota errors instead of silently losing the event',()=>{
  expect(()=>savePublicationPreview(publishedA,{setItem:()=>{throw new Error('quota');}})).toThrow(/空间/);
 });
 it('rejects maps that require additional downloads',()=>{
  const data=structuredClone(publishedA); data.event.raceCourses![0].maps![0].image.encodedData=undefined;
  data.event.raceCourses![0].maps![0].image.url='maps/map.pdf';
  expect(()=>savePublicationPreview(data,memory())).toThrow(/嵌入/);
 });
});
