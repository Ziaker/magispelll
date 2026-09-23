/**
 * magicActivationContext.ts - deriva o contexto necessário para validar cartas mágicas.
 *
 * Compartilha a mesma visão entre motor, UI, IA e action-space sem depender do reducer.
 */
import { getEffectiveCardValue, isNumeralCard, isPlainNumeralCard } from './cardUtils';
import type { MagicActivationContext } from './magicCards';
import type { PlayerNumber } from './gameTypes';
import type { GameState } from './gameStateTypes';
import { opponentKeyOf, opponentOf, playerKeyOf } from './gameSelectors';
import { fieldCards, getDestroyableReinforcementSlots, getFilledFieldSlots, getUnbattledHorizontalSlots, getUnrevealedFieldSlots } from './fieldQueries';
import { isBrotoSlot } from './fieldLifecycle';
import { isSlotProtected } from './anjoRules';
import { hasStatus } from './statusEffects';
/** Contexto usado tanto pela UI (para habilitar/desabilitar botões) quanto pelo motor (para validar de novo ao executar). */
export function getMagicActivationContext(state: GameState, player: PlayerNumber): MagicActivationContext {
  const playerState = state[playerKeyOf(player)];
  const opponentState = state[opponentKeyOf(player)];
  const opponent = opponentOf(player);

  return {
    discardPileLength: state.discardPile.length,
    eligibleDiscardForBestaJ: state.discardPile.filter((c) => isPlainNumeralCard(c)).length,
    hasCardsInOwnField: getFilledFieldSlots(playerState.field).length > 0,
    hasCardsInField: getFilledFieldSlots(playerState.field).length > 0 || getFilledFieldSlots(opponentState.field).length > 0,
    hasRevealedCardsInOpponentField: opponentState.field.some((slot) => slot.faceDownCard && slot.revealed),
    // FIX (auditoria completa do Mago - bug real encontrado): diferente de
    // `hasRevealedCardsInOpponentField` acima, este exclui slots protegidos
    // por Proteção Divina - é o que o gate da Substituição Arcana (Rainha)
    // do Mago realmente precisa, já que handleExecuteMagic rejeita um slot
    // do oponente revelado mas protegido.
    hasRevealedUnprotectedCardInOpponentField: opponentState.field.some(
      (slot, i) => slot.faceDownCard && slot.revealed && !isSlotProtected(state, opponent, i)
    ),
    // FIX (mudança de planos do Tiro Certeiro, pedido do usuário: "marcadores
    // negativos nas cartas do campo do oponente"): diferente do campo acima,
    // NÃO exige revelada - Tiro Certeiro sempre pôde mirar carta oculta
    // (antes, a própria; a identidade não importava porque era sempre a
    // MESMA carta do dono ativando). Mudar só o "de quem" é o campo, mantendo
    // a mesma regra de visibilidade de sempre, é a leitura mais fiel ao
    // pedido (nunca restringiu a alvo revelado) - e é o que torna a escolha
    // ALEATÓRIA da IA (também pedida) genuinamente necessária: sem ver o
    // valor de uma carta oculta, não há "melhor alvo" possível de calcular.
    hasUnprotectedCardInOpponentField: opponentState.field.some(
      (slot, i) => (slot.faceDownCard || slot.horizontalCards.length > 0) && !isSlotProtected(state, opponent, i)
    ),
    // FIX (pedido do usuário: "a rainha do anjo impede a ativação de um
    // efeito... até o fim do turno") - ver StatusEffect kind 'magicLocked'
    // (statusEffects.ts) e o guard de topo em canActivateMagic. Só entra na
    // lista quando EXISTE pelo menos 1 carta daquele valor na mão e TODAS
    // estão trancadas - havendo uma cópia alternativa destrancada, a
    // ativação continua livre.
    lockedMagicValues: (['J', 'Q', 'K'] as const).filter((v) => {
      const cardsOfValue = playerState.hand.filter((c) => c.value === v);
      return cardsOfValue.length > 0 && cardsOfValue.every((c) => hasStatus(c, 'magicLocked'));
    }),
    // FIX (auditoria completa do Mago - bug real encontrado): agora também
    // exclui slots protegidos - único consumidor deste campo é o gate da
    // Destruição de Reforço (Rei) do Mago, que precisa exatamente disso.
    // FIX (pedido do usuário: "permita que o mago possa destruir marcadores
    // em sua magia do rei") - agora também considera slots sem horizontal
    // nenhuma mas com um StatusEffect 'combatModifier' destruível (ver
    // getDestroyableReinforcementSlots acima).
    hasUnbattledHorizontalCardsInOpponentField: getDestroyableReinforcementSlots(opponentState.field).some(
      (i) => !isSlotProtected(state, opponent, i)
    ),
    handSize: playerState.hand.length,
    handLimit: playerState.handLimit,
    hasNumeralCardsInHand: playerState.hand.some((c) => isNumeralCard(c)),
    hasRevealedNumeralCardsInOpponentHand: opponentState.hand.some((c) => isNumeralCard(c) && c.revealed),
    hasUnrevealedCardInOwnField: getUnrevealedFieldSlots(playerState.field).length > 0,
    // FIX (auditoria completa da Besta - bug real encontrado): agora também
    // exclui slots protegidos - único consumidor deste campo é o gate do
    // Roubo Brutal (Rei) da Besta, que precisa exatamente disso (o alvo do
    // oponente nunca pode estar protegido - ver handleExecuteMagic).
    hasUnrevealedCardInOpponentField: getUnrevealedFieldSlots(opponentState.field).some((i) => !isSlotProtected(state, opponent, i)),
    // FIX (pedido do usuário: "mude o efeito da valete do anjo para 'compre
    // um Ás'") - true quando há um Ás no baralho OU na pilha de descarte
    // (pública, reembaralhada de volta se precisar - ver handleActivateSimpleMagic).
    // Um Ás já em alguma mão/campo/zona de Monstro não conta.
    hasAceAvailableToDraw: state.deck.some((c) => c.value === 'A') || state.discardPile.some((c) => c.value === 'A'),
    // Mosqueteiro (personagem novo, foco em descarte) - ver comentário
    // completo em MagicActivationContext (magicCards.ts).
    mosqueteiroRedirectActive: hasStatus(playerState, 'redirectNextDiscard'),
    hasOwnHandCardBeyondSelf: playerState.hand.length > 1,
    hasOpponentHandCards: opponentState.hand.length > 0,
    hasRevealableOpponentCards:
      opponentState.hand.some((c) => !c.revealed) ||
      opponentState.field.some((slot) => (slot.faceDownCard && !slot.faceDownCard.revealed) || slot.horizontalCards.some((h) => !h.revealed)),
    // Piromante (personagem novo) - ver comentário completo em
    // MagicActivationContext (magicCards.ts).
    hasFireFuelInHand: playerState.hand.some((c) => isPlainNumeralCard(c) && getEffectiveCardValue(c) < 5),
    hasRevealedBurnableOpponentCard:
      opponentState.hand.some((c) => c.revealed && isNumeralCard(c)) ||
      opponentState.field.some((slot) => slot.horizontalCards.some((h) => h.revealed && isNumeralCard(h))),
    hasUnbattledHorizontalCardsInOpponentFieldForBurn: getUnbattledHorizontalSlots(opponentState.field).some(
      (i) => !isSlotProtected(state, opponent, i)
    ),
    // FIX (pedido do usuário): o lançamento da Bola de Fogo é uma jogada de
    // COMBATE - fora dessa fase a opção nem aparece no diálogo (ver
    // `launchAvailable` em GameBoard.tsx) e `canActivateMagic` não considera
    // mais "posso lançar" como motivo pra liberar a magia. O bloqueio de
    // verdade fica em executeFireballLaunch (nunca confiar só na UI).
    canLaunchFireball:
      state.phase === 'combat' &&
      playerState.fireballValue > 0 &&
      opponentState.field.some((slot) => Boolean(slot.faceDownCard) || slot.horizontalCards.length > 0),
    // FIX (pedido do usuário: "remova o segundo efeito de aumentar em 2 -
    // plantar a própria carta como Broto é que deve ser o segundo efeito") -
    // Simbiose/Urtiga só têm mais o efeito de REDUZIR o Broto agora - exige
    // um Broto valendo >= 2 (nada pra reduzir de um Broto valendo 1) E um
    // alvo de verdade disponível (ver MagicActivationContext.canReduceBroto/
    // hasSimbioseTarget em magicCards.ts).
    canReduceBroto: (() => {
      const brotoSlot = playerState.field.find(isBrotoSlot);
      return Boolean(brotoSlot) && (brotoSlot!.faceDownCard!.transformedValue ?? 1) >= 2;
    })(),
    hasSimbioseTarget: playerState.field.some((slot) => (slot.faceDownCard && !isBrotoSlot(slot)) || slot.horizontalCards.length > 0),
    // Glacial (personagem novo) - "qualquer alvo possível" (alvo omisso na
    // especificação do usuário): mão OU campo, de QUALQUER jogador, contanto
    // que a carta ainda não esteja congelada.
    hasFreezableCard:
      playerState.hand.some((c) => !hasStatus(c, 'frozen')) ||
      opponentState.hand.some((c) => !hasStatus(c, 'frozen')) ||
      fieldCards(playerState.field).some((c) => !hasStatus(c, 'frozen')) ||
      fieldCards(opponentState.field).some((c) => !hasStatus(c, 'frozen')),
    // Crioespinho (Rainha do Glacial): só campo, de qualquer jogador.
    hasFreezableFieldCard: fieldCards(playerState.field).some((c) => !hasStatus(c, 'frozen')) || fieldCards(opponentState.field).some((c) => !hasStatus(c, 'frozen')),
    // Crioescudo (Rei do Glacial), efeito de COMBATE (mudança de efeito
    // pedida pelo usuário: "adicione marcador -1 para cartas congeladas do
    // oponente, podendo ser ativado caso há no mínimo 1 carta congelada no
    // campo") - antes exigia uma congelada PRÓPRIA; agora qualquer lado serve.
    hasAnyFrozenFieldCard: fieldCards(playerState.field).some((c) => hasStatus(c, 'frozen')) || fieldCards(opponentState.field).some((c) => hasStatus(c, 'frozen')),
    // Crioescudo (Rei do Glacial), NOVO efeito de ESTRATÉGIA: alguma carta
    // PRÓPRIA (mão ou campo) ainda não congelada pra congelar.
    hasFreezableOwnCard: playerState.hand.some((c) => !hasStatus(c, 'frozen')) || fieldCards(playerState.field).some((c) => !hasStatus(c, 'frozen')),
  };
}
