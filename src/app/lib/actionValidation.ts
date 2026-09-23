/**
 * actionValidation.ts - ponto comum para responder a pergunta:
 * "o reducer aceitou esta ação como mudança real de gameplay?"
 *
 * O motor às vezes rejeita uma ação adicionando apenas uma entrada ao log
 * para explicar o motivo. Comparar referências (`next !== state`) considera
 * esse caso erroneamente como uma ação aceita. A regra abaixo ignora somente
 * `log`, preservando o reducer como autoridade final sobre legalidade.
 *
 * Este módulo é intencionalmente pequeno: ele não duplica nenhum `canX` e
 * não tenta adivinhar regras. Ele apenas executa o reducer real e classifica
 * o resultado. É a base para UI, IA, simulação e debug convergirem na mesma
 * semântica durante o Legal Actions Overhaul.
 */
import { gameReducer, type GameAction, type GameState } from './gameEngine';

/** Compara o estado de gameplay ignorando somente o log explicativo. */
export function isSameGameplayState<T extends { log: unknown }>(a: T, b: T): boolean {
  if (a === b) return true;
  const { log: _logA, ...restA } = a;
  const { log: _logB, ...restB } = b;
  return JSON.stringify(restA) === JSON.stringify(restB);
}

export interface ActionEvaluation {
  /** `true` quando alguma parte do gameplay mudou, não apenas o log. */
  accepted: boolean;
  /** Estado devolvido pelo reducer real; deve ser usado em vez de reduzi-lo de novo. */
  nextState: GameState;
}

/**
 * Executa uma ação exatamente uma vez no reducer e informa se ela foi aceita.
 * Assim consumidores que precisam validar/medir uma ação não precisam manter
 * sua própria definição de "aceita" nem executar o reducer duas vezes.
 */
export function evaluateAction(state: GameState, action: GameAction): ActionEvaluation {
  const nextState = gameReducer(state, action);
  return {
    accepted: !isSameGameplayState(state, nextState),
    nextState,
  };
}
