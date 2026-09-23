/**
 * actionValidation.ts - ponto comum para responder a pergunta:
 * "o reducer aceitou esta ação como mudança real de gameplay?"
 *
 * O motor às vezes rejeita uma ação adicionando apenas uma entrada ao log
 * para explicar o motivo. Comparar referências (`next !== state`) considera
 * esse caso erroneamente como uma ação aceita. A regra compartilhada ignora
 * somente `log`, preservando o reducer como autoridade final sobre legalidade.
 *
 * Este módulo é intencionalmente pequeno: ele não duplica nenhum `canX` e
 * não tenta adivinhar regras. Ele apenas executa o reducer real e classifica
 * o resultado. É a base para UI, IA, simulação e debug convergirem na mesma
 * semântica durante o Legal Actions Overhaul.
 */
import { gameReducer, type GameAction, type GameState } from './gameEngine';
import { isSameGameplayState } from './gameplayState';

/** Compatibilidade: consumidores existentes podem continuar importando daqui. */
export { isSameGameplayState } from './gameplayState';

export interface ActionEvaluation {
  /** `true` quando alguma parte do gameplay mudou, não apenas o log. */
  accepted: boolean;
  /** Estado devolvido pelo reducer real; deve ser usado em vez de reduzi-lo de novo. */
  nextState: GameState;
  /**
   * Mensagem produzida pelo próprio motor quando uma ação rejeitada adiciona
   * um aviso ao log. `undefined` quando a rejeição é silenciosa.
   */
  rejectionReason?: string;
}

/**
 * Pega apenas uma mensagem NOVA gerada por esta tentativa. Compara `id`, não
 * tamanho do array, porque o log é limitado e pode remover uma entrada antiga
 * no mesmo passo em que adiciona a nova.
 */
function getRejectionReason(previous: GameState, next: GameState): string | undefined {
  const previousLastId = previous.log.length > 0 ? previous.log[previous.log.length - 1].id : -1;
  for (let i = next.log.length - 1; i >= 0; i--) {
    if (next.log[i].id > previousLastId) return next.log[i].text;
  }
  return undefined;
}

/**
 * Executa uma ação exatamente uma vez no reducer e informa se ela foi aceita.
 * Assim consumidores que precisam validar/medir uma ação não precisam manter
 * sua própria definição de "aceita" nem executar o reducer duas vezes.
 */
export function evaluateAction(state: GameState, action: GameAction): ActionEvaluation {
  const nextState = gameReducer(state, action);
  const accepted = !isSameGameplayState(state, nextState);
  return {
    accepted,
    nextState,
    rejectionReason: accepted ? undefined : getRejectionReason(state, nextState),
  };
}
