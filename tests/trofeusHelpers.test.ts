import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eImagemRealTrofeu, emojiTrofeu } from '../src/utils/trofeusHelpers';

describe('eImagemRealTrofeu', () => {
  it('reconhece data: URL como imagem real (upload personalizado)', () => {
    assert.equal(eImagemRealTrofeu('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='), true);
  });

  it('reconhece URLs http/https como imagem real', () => {
    assert.equal(eImagemRealTrofeu('https://exemplo.com/trofeu.png'), true);
    assert.equal(eImagemRealTrofeu('http://exemplo.com/trofeu.png'), true);
  });

  it('REGRESSÃO: chave da galeria ("trofeu", "medalha_ouro") NÃO é imagem', () => {
    assert.equal(eImagemRealTrofeu('trofeu'), false);
    assert.equal(eImagemRealTrofeu('medalha_ouro'), false);
  });

  it('REGRESSÃO: chaves legadas dos dados padrão NÃO são imagens (não quebra <img>)', () => {
    // Bug real: as regras padrão usam chaves como "streak_3", "acertos_100",
    // "defesa_1", "recuperacao_1", "veterano_10". A heurística antiga as
    // tratava como URL e renderizava <img> quebrado.
    assert.equal(eImagemRealTrofeu('streak_3'), false);
    assert.equal(eImagemRealTrofeu('streak_7'), false);
    assert.equal(eImagemRealTrofeu('streak_15'), false);
    assert.equal(eImagemRealTrofeu('acertos_100'), false);
    assert.equal(eImagemRealTrofeu('defesa_1'), false);
    assert.equal(eImagemRealTrofeu('recuperacao_1'), false);
    assert.equal(eImagemRealTrofeu('veterano_10'), false);
  });

  it('valor vazio ou undefined NÃO é imagem', () => {
    assert.equal(eImagemRealTrofeu(undefined), false);
    assert.equal(eImagemRealTrofeu(''), false);
  });
});

describe('emojiTrofeu', () => {
  it('retorna emoji da galeria para chaves conhecidas', () => {
    assert.equal(emojiTrofeu('trofeu'), '🏆');
    assert.equal(emojiTrofeu('medalha_ouro'), '🥇');
  });

  it('retorna emoji padrão para chaves legadas fora da galeria', () => {
    assert.equal(emojiTrofeu('streak_3'), '🏆');
    assert.equal(emojiTrofeu('acertos_100'), '🏆');
  });

  it('retorna emoji padrão para imagem real (o <img> substitui)', () => {
    assert.equal(emojiTrofeu('data:image/png;base64,AAAA'), '🏆');
    assert.equal(emojiTrofeu('https://exemplo.com/t.png'), '🏆');
  });
});