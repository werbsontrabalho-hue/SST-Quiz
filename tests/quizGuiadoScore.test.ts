import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPontosQuizGuiado } from '../src/utils/quizGuiadoScore';

describe('calcularPontosQuizGuiado', () => {
  it('errou: zero pontos em qualquer modo', () => {
    assert.equal(calcularPontosQuizGuiado({ correta: false, estilo: 'competitivo', tempoMs: 1000, tempoPorPerguntaSeg: 30 }), 0);
    assert.equal(calcularPontosQuizGuiado({ correta: false, estilo: 'educacional', tempoMs: 1000, tempoPorPerguntaSeg: 30 }), 0);
  });

  it('modo não-competitivo: valor fixo de 100 por acerto', () => {
    assert.equal(calcularPontosQuizGuiado({ correta: true, estilo: 'educacional', tempoMs: 20000, tempoPorPerguntaSeg: 30 }), 100);
    assert.equal(calcularPontosQuizGuiado({ correta: true, estilo: undefined, tempoMs: 20000, tempoPorPerguntaSeg: 30 }), 100);
  });

  it('competitivo: resposta instantânea dá o máximo de pontos', () => {
    assert.equal(calcularPontosQuizGuiado({ correta: true, estilo: 'competitivo', tempoMs: 0, tempoPorPerguntaSeg: 30 }), 1500);
  });

  it('competitivo: resposta no limite de tempo dá o mínimo de pontos', () => {
    assert.equal(calcularPontosQuizGuiado({ correta: true, estilo: 'competitivo', tempoMs: 30000, tempoPorPerguntaSeg: 30 }), 1000);
  });

  it('competitivo: meio-tempo dá valor intermediário', () => {
    const valor = calcularPontosQuizGuiado({ correta: true, estilo: 'competitivo', tempoMs: 15000, tempoPorPerguntaSeg: 30 });
    assert.equal(valor, 1250);
  });

  it('competitivo: tempo acima do limite não gera pontos negativos', () => {
    assert.equal(calcularPontosQuizGuiado({ correta: true, estilo: 'competitivo', tempoMs: 60000, tempoPorPerguntaSeg: 30 }), 1000);
  });

  it('pontos do servidor têm prioridade sobre o cálculo local', () => {
    assert.equal(
      calcularPontosQuizGuiado({ correta: true, estilo: 'competitivo', tempoMs: 5000, tempoPorPerguntaSeg: 30, pontosServer: 1420 }),
      1420
    );
  });

  it('tempo_por_pergunta ausente usa o padrão de 30s', () => {
    assert.equal(calcularPontosQuizGuiado({ correta: true, estilo: 'competitivo', tempoMs: 0 }), 1500);
  });
});