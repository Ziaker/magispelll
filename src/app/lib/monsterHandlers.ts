/**
 * monsterHandlers.ts - transições de estado da Zona Monstro.
 *
 * Este primeiro corte concentra apenas posicionamento. A lifecycle de
 * uso/expiração continua em monsterLifecycle e efeitos ficam separados.
 */
import { appendLog } from './gameLog';
import { characterOf, playerKeyOf } from './gameSelectors';
import { MAX_MONSTER_USES } from './monsterLifecycle';
import { hasStatus } from './statusEffects';
import type { GameState } from './gameStateTypes';
import type { PlayerNumber } from './gameTypes';
/**
 * Posiciona uma carta Monstro da mão na zona própria do jogador. Só permitido
 * enquanto a zona estiver vazia (um Monstro por vez) - a segunda carta
 * Monstro do baralho, se comprada, fica na mão até a zona esvaziar (ou até a
 * primeira se descartar depois do 3º uso - ver resolveMonsterCardAtTurnEnd).
 *
 * FIX (checagem extensa por bugs, achado via teste de propriedade: "a IA
 * nunca propõe uma ação que o motor rejeita em silêncio" - script/sanity-test.ts):
 * uma carta Monstro que já esgotou `MAX_MONSTER_USES` normalmente só existe
 * fora da zona por um instante, indo direto pro DESCARTE
 * (resolveMonsterCardAtTurnEnd) - mas nada a torna diferente de um Coringa
 * comum uma vez no descarte: `monsterUseCount` nunca reseta (por design),
 * mas o reembaralhamento do descarte de volta ao baralho (`autoShuffle`) não
 * sabe disso, então ela pode voltar a circular e ser comprada de novo por
 * QUALQUER jogador - inclusive via um caminho que devolve cartas direto pra
 * mão sem passar pelo descarte (ex.: o campo do oponente voltando pra mão
 * dele na ativação de uma Magia Numeral, ou a Fúria Sanguinária da Besta
 * puxando do baralho reembaralhado). Sem esta guarda, essa carta "morta" era
 * posicionada normalmente (parecia igual a uma nova) mas NENHUMA ativação
 * dela nunca seria aceita de novo (a guarda de segurança em
 * handleActivateMonsterEffectSimple/handleExecuteMagoMonsterEffect sempre
 * rejeita `monsterUseCount >= MAX_MONSTER_USES`) - um Coringa permanentemente
 * morto preso na zona, sem nenhum aviso do motivo, e a IA (decidePlaceMonsterCard
 * em aiPlayer.ts, ajustado junto) propondo ativá-lo pra sempre. Rejeitar a
 * colocação aqui fecha o buraco na ÚNICA porta de entrada da zona, em vez de
 * tentar prevenir cada caminho possível que devolve uma carta assim pra
 * alguma mão.
 */
export function handlePlaceMonsterCard(state: GameState, player: PlayerNumber, cardId: string): GameState {
  if (state.phase !== 'strategy') return state;
  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  // Coringa (redesenho completo, pedido do usuário: "ao invés de ser
  // posicionado [na zona], é tratado como uma carta de número 15") - nunca
  // usa a Zona Monstro - a carta vai pro campo normal via PLAY_CARD/
  // SWAP_FIELD_CARD, como qualquer carta numeral comum.
  // Druida (personagem novo, "pode ser jogada no campo como uma carta
  // numeral valendo o mesmo valor que o Broto") - mesmo padrão do Coringa:
  // nunca usa a Zona Monstro, vai pro campo normal via PLAY_CARD (ver
  // handlePlayCard).
  // Glacial (personagem novo, "Criogolem vale 8 + 1 por carta congelada em
  // jogo") - mesmo padrão do Coringa/Druida acima, nunca usa a Zona Monstro.
  if (characterOf(state, player) === 'coringa' || characterOf(state, player) === 'druida' || characterOf(state, player) === 'glacial') return state;
  if (playerState.monsterCard) return state; // zona já ocupada

  const card = playerState.hand.find((c) => c.id === cardId);
  if (!card || !card.isMonster) return state;
  if ((card.monsterUseCount ?? 0) >= MAX_MONSTER_USES) return state;
  // FIX (pedido do usuário: "as correntes do anjo também devem proibir a
  // utilização/posicionamento da carta monstro do oponente") - mesmo guard
  // de handlePlayCard acima, pro caminho da Zona Monstro (os 5 personagens
  // que não jogam o Monstro como substituto de numeral).
  if (hasStatus(card, 'magicLocked')) {
    return { ...state, log: appendLog(state, state.log, 'warning', `Esta carta Monstro está trancada pela Visão Celestial e não pode ser posicionada!`, { animationPolicy: 'suppress' }) };
  }

  const newHand = playerState.hand.filter((c) => c.id !== cardId);
  const log = appendLog(state, state.log, 'monster', `Jogador ${player} posicionou uma carta Monstro em sua zona própria`, { player, cardValue: '🃏' });

  return {
    ...state,
    log,
    [playerKey]: { ...playerState, hand: newHand, monsterCard: card, monsterTargetSlot: undefined },
  };
}
