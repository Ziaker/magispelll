/**
 * dragActivation.ts - Registro de "arrastar pra ativar" (pedido do usuário:
 * "eu queria que desse pra ser mais rápido... permitindo que o jogador
 * arraste a sua magia até o campo do alvo... isso é pra ser uma feature pra
 * outros personagens também que possuem alvos escolhíveis").
 *
 * Hoje ativar uma magia com alvo exige 3 cliques (carta -> alvo -> confirmar)
 * mesmo quando o alvo inteiro já é conhecido de antemão (um único slot de
 * campo). Este módulo é a fonte ÚNICA de verdade de QUAIS magias têm essa
 * forma simples o bastante pra virar um atalho de arrastar-e-soltar direto
 * no slot, e COMO montar a `MagicSelection` a partir do slot largado -
 * GameBoard.tsx/FieldSlotView.tsx nunca hardcodeiam personagem nenhum, só
 * consultam `getDragActivationRule`.
 *
 * ESCOPO (deliberadamente restrito): só magias cuja seleção INTEIRA se
 * resume a "escolher 1 slot de campo" - nada de seleção composta (ex.: Q do
 * Mago/Besta, que pedem um slot de QUALQUER lado MAIS uma carta de mão
 * separada; K da Besta, que pede um slot PRÓPRIO E um do oponente ao mesmo
 * tempo; Rainha do Mosqueteiro, que pede descartes E revelações
 * independentes) nem efeitos de Monstro (vivem na Zona própria, não são
 * cartas de mão pra arrastar - fora do pedido literal do usuário). Isso
 * ainda cobre a Bola de Fogo do Piromante (o caso original que motivou o
 * pedido) e mais 2 magias já existentes (Destruição de Reforço do Mago,
 * Visão Celestial do Anjo) - e qualquer personagem FUTURO com uma magia
 * "aponta pra 1 slot" só precisa de uma entrada nova aqui, nunca mexer em
 * FieldSlotView.tsx/GameBoard.tsx de novo.
 *
 * EXTENSÃO: pra adicionar um personagem/magia novo aqui, adicione uma
 * entrada em `DRAG_ACTIVATION_RULES` com a chave `${character}-${magicType}`.
 * `side` diz de qual campo os slots-alvo válidos vêm (o mesmo jogador que
 * arrasta, ou o oponente dele); `isValidSlotTarget` decide se ESTE slot
 * específico aceita o drop agora (reaproveite a mesma checagem que o motor
 * usa pra aceitar a ativação de verdade, nunca invente uma segunda cópia da
 * regra); `buildSelection` monta a `MagicSelection` exatamente como o
 * diálogo de clique já monta pro mesmo caso.
 */
import {
  isSlotProtected,
  opponentOf,
  playerKeyOf,
  type CharacterId,
  type GameState,
  type MagicSelection,
  type PlayerNumber,
} from './gameEngine';
import type { MagicCardType } from './magicCards';

export interface DragActivationRule {
  side: 'own' | 'opponent';
  isValidSlotTarget: (state: GameState, player: PlayerNumber, slotIndex: number) => boolean;
  buildSelection: (state: GameState, player: PlayerNumber, slotIndex: number) => MagicSelection;
}

/**
 * Piromante - Lançar a Bola de Fogo: a mesma regra vale pras 3 cartas (J/Q/K)
 * quando usadas no modo "lançar" (ver `fireballLaunch` em MagicSelection,
 * `executeFireballLaunch`/`canLaunchFireball` em gameEngine.ts) - arrastar
 * QUALQUER uma das 3 direto num slot do oponente já escolhe esse slot como
 * alvo E o modo "lançar" ao mesmo tempo (a própria ação de soltar no campo
 * do OPONENTE, em vez de clicar "efeito próprio", já desambigua a escolha
 * que hoje precisa de um clique extra no diálogo).
 */
const fireballLaunchRule: DragActivationRule = {
  side: 'opponent',
  isValidSlotTarget: (state, player, slotIndex) => {
    const opponent = opponentOf(player);
    if (isSlotProtected(state, opponent, slotIndex)) return false;
    const slot = state[playerKeyOf(opponent)].field[slotIndex];
    return Boolean(slot.faceDownCard) || slot.horizontalCards.length > 0;
  },
  buildSelection: (_state, _player, slotIndex) => ({ fireballLaunch: true, selectedTargetSlot: slotIndex }),
};

/** Mago K - Destruição de Reforço: mesma checagem de elegibilidade que handleExecuteMagic usa (slot com reforço horizontal, nenhum já batalhado). */
const magoKRule: DragActivationRule = {
  side: 'opponent',
  isValidSlotTarget: (state, player, slotIndex) => {
    const opponent = opponentOf(player);
    if (isSlotProtected(state, opponent, slotIndex)) return false;
    const horizontalCards = state[playerKeyOf(opponent)].field[slotIndex].horizontalCards;
    return horizontalCards.length > 0 && !horizontalCards.some((c) => c.battled);
  },
  buildSelection: (_state, _player, slotIndex) => ({ selectedSlot: slotIndex }),
};

/**
 * Anjo Q - Visão Celestial, só o modo "revelar slot de campo" (a magia tem
 * um 2º modo, revelar carta de mão, que continua só por clique - não tem
 * "slot" nenhum pra arrastar até).
 */
const anjoQFieldRule: DragActivationRule = {
  side: 'opponent',
  isValidSlotTarget: (state, player, slotIndex) => {
    const opponent = opponentOf(player);
    const slot = state[playerKeyOf(opponent)].field[slotIndex];
    if (!slot.faceDownCard || slot.revealed) return false;
    return !isSlotProtected(state, opponent, slotIndex);
  },
  buildSelection: (_state, _player, slotIndex) => ({ selectedSlot: slotIndex }),
};

/**
 * Mosqueteiro K - Tiro Certeiro: reforça uma carta do PRÓPRIO campo
 * (`selectedCards`, não `selectedSlot` - a ativação por clique deixa
 * escolher a principal OU uma horizontal específica dentro do slot).
 * Arrastar e soltar sempre mira a carta PRINCIPAL do slot - simplificação
 * deliberada (soltar "no slot" não distingue qual das cartas dentro dele);
 * reforçar uma horizontal específica continua exigindo o fluxo de clique.
 */
const mosqueteiroKRule: DragActivationRule = {
  side: 'own',
  isValidSlotTarget: (state, player, slotIndex) => Boolean(state[playerKeyOf(player)].field[slotIndex].faceDownCard),
  buildSelection: (state, player, slotIndex) => ({
    selectedCards: [state[playerKeyOf(player)].field[slotIndex].faceDownCard!.id],
  }),
};

type DragActivationKey = `${CharacterId}-${MagicCardType}`;

const DRAG_ACTIVATION_RULES: Partial<Record<DragActivationKey, DragActivationRule>> = {
  'piromante-J': fireballLaunchRule,
  'piromante-Q': fireballLaunchRule,
  'piromante-K': fireballLaunchRule,
  'mago-K': magoKRule,
  'anjo-Q': anjoQFieldRule,
  'mosqueteiro-K': mosqueteiroKRule,
};

export function getDragActivationRule(character: CharacterId, magicType: MagicCardType): DragActivationRule | undefined {
  return DRAG_ACTIVATION_RULES[`${character}-${magicType}`];
}
