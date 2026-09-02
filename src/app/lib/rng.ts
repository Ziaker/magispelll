/**
 * rng.ts - fonte de aleatoriedade com seed opcional (item 2 do plano de
 * melhoria do debug mode: "prever qualquer ação possível" + reprodutibilidade
 * de falhas intermitentes).
 *
 * Antes desta peça, toda aleatoriedade do jogo (`shuffle` em cardUtils.ts,
 * `rollSpotlight`/`rollPolarity` em spotlight.ts, ~11 pontos de decisão em
 * aiPlayer.ts) usava `Math.random()` cru - o bug de conservação de cartas do
 * Coringa caçado nesta sessão só reproduzia ~1 em 3-5 execuções, e a única
 * forma de encontrá-lo foi rodar em loop cego até acontecer de novo, sem
 * NENHUMA forma de reproduzir a mesma partida exata uma segunda vez.
 *
 * `random()` delega pra `Math.random()` por padrão - comportamento do jogo
 * em produção NUNCA muda. `setSeed(n)` troca a implementação interna por um
 * PRNG determinístico (mulberry32) - chamar `setSeed` com o MESMO número
 * duas vezes produz exatamente a mesma sequência de `random()` depois.
 *
 * ARMADILHA A EVITAR em qualquer código que use isto pra fuzzing (ver
 * scripts/fuzz.ts): se alguma decisão do PRÓPRIO harness de fuzzing usa
 * aleatoriedade (ex.: "às vezes substituo a escolha da IA por uma ação
 * aleatória"), essa decisão TAMBÉM precisa vir de `random()` daqui - senão
 * seed+matchup+config não é suficiente pra reproduzir uma corrida específica,
 * porque sobra uma fonte de aleatoriedade fora do seed.
 */

/** mulberry32 - PRNG determinístico pequeno e rápido, suficiente pra testes (não é criptográfico). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let currentSeed: number | undefined;
let impl: () => number = Math.random;

/** Número aleatório em [0, 1) - use no lugar de `Math.random()` em qualquer código que participe de uma simulação/fuzz reproduzível. */
export function random(): number {
  return impl();
}

/** Troca a fonte de aleatoriedade pra um PRNG determinístico - a MESMA seed produz a MESMA sequência de `random()` daqui em diante. */
export function setSeed(seed: number): void {
  currentSeed = seed;
  impl = mulberry32(seed);
}

/** Volta a delegar pra `Math.random()` (comportamento padrão, não determinístico). */
export function clearSeed(): void {
  currentSeed = undefined;
  impl = Math.random;
}

/** Seed ativa agora, ou `undefined` se estiver usando `Math.random()` cru. */
export function getSeed(): number | undefined {
  return currentSeed;
}
