/**
 * gameplayState.ts - helpers estruturais de estado sem dependência do reducer.
 *
 * Algumas rejeições do motor acrescentam somente uma entrada explicativa ao
 * log. Para decidir se houve mudança REAL de gameplay, consumidores internos
 * e externos precisam ignorar apenas esse campo. Este módulo fica abaixo de
 * gameEngine/actionValidation na árvore de dependências para os dois poderem
 * compartilhar a mesma definição sem criar ciclo de imports.
 */

/** Compara estados de gameplay ignorando somente o log explicativo. */
export function isSameGameplayState<T extends { log: unknown }>(a: T, b: T): boolean {
  if (a === b) return true;
  const { log: _logA, ...restA } = a;
  const { log: _logB, ...restB } = b;
  return JSON.stringify(restA) === JSON.stringify(restB);
}
