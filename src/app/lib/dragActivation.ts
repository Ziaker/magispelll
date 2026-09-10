/**
 * dragActivation.ts - Registro de "arrastar pra ativar" (pedido original do
 * usuário: "eu queria que desse pra ser mais rápido... permitindo que o
 * jogador arraste a sua magia até o campo do alvo"; pedido posterior:
 * "permita que TODAS as magias que pedem seleção de alvo APENAS para sua
 * ativação possam ser ativadas de imediato com drag&drop no alvo
 * correspondente").
 *
 * Hoje ativar uma magia com alvo exige 3 cliques (carta -> alvo -> confirmar)
 * mesmo quando o alvo inteiro já é conhecido de antemão (um único slot de
 * campo). Este módulo é a fonte ÚNICA de verdade de QUAIS magias têm essa
 * forma simples o bastante pra virar um atalho de arrastar-e-soltar direto
 * no slot, e COMO montar a `MagicSelection` a partir do slot largado -
 * GameBoard.tsx/FieldSlotView.tsx nunca hardcodeiam personagem nenhum, só
 * consultam `getDragActivationRule`.
 *
 * ESCOPO: toda magia cuja seleção INTEIRA se resume a "escolher 1 slot de
 * campo" (do próprio lado, do oponente, OU de qualquer um dos dois - ver
 * `side: 'either'` abaixo) ganha uma entrada aqui - hoje cobre a Bola de
 * Fogo do Piromante (J/Q/K, o caso original que motivou o pedido),
 * Destruição de Reforço do Mago (K), Visão Celestial do Anjo (Q, só o modo
 * "revelar slot"), Tiro Certeiro do Mosqueteiro (K), Simbiose/Urtiga do
 * Druida (Q/K, só o modo "marcador" - a opção "aumentar o Broto" não tem
 * alvo, e plantar/empilhar o Broto em si já tem seu próprio atalho de
 * arrastar via PLAY_CARD, ver isDruidaBrotoCard em gameEngine.ts) e
 * Criogenar/Crioespinho do Glacial (J/Q, só o modo "slot de campo" - Criogenar
 * também aceita mirar uma carta de MÃO, que continua só por clique, mesmo
 * padrão de exclusão parcial do Anjo Q acima).
 *
 * FICAM DE FORA as magias de seleção COMPOSTA (mais de uma escolha
 * independente pra completar a ativação) - não há um único "alvo" pra um
 * gesto de arrastar representar sem ambiguidade: Q do Mago/Besta (um slot de
 * QUALQUER lado MAIS uma carta de mão separada), K da Besta (um slot PRÓPRIO
 * E um do oponente ao mesmo tempo), Rainha do Mosqueteiro (descartes E
 * revelações independentes, cada um podendo ser mais de 1 carta), Valete do
 * Mosqueteiro/Anjo Q no modo "carta da mão" (a mão do oponente não é uma
 * zona de campo arrastável). Efeitos de Monstro também ficam de fora (vivem
 * na Zona própria, não são cartas de mão pra arrastar). Qualquer personagem
 * FUTURO com uma magia "aponta pra 1 slot" só precisa de uma entrada nova
 * aqui, nunca mexer em FieldSlotView.tsx/GameBoard.tsx de novo.
 *
 * EXTENSÃO: pra adicionar um personagem/magia novo aqui, adicione uma
 * entrada em `DRAG_ACTIVATION_RULES` com a chave `${character}-${magicType}`.
 * `side` diz de qual campo os slots-alvo válidos vêm: o mesmo jogador que
 * arrasta ('own'), o oponente dele ('opponent'), ou QUALQUER um dos dois
 * campos ('either' - pedido do usuário: "Criogenar/Crioespinho miram o
 * próprio campo OU o do oponente, à escolha do jogador" - o Glacial J/Q são
 * o caso original que motivou este 3º valor). `isValidSlotTarget`/
 * `buildSelection` recebem o `targetPlayer` (o lado de fato largado, sempre
 * igual ao lado fixo de 'own'/'opponent', mas livre pra ser QUALQUER um dos
 * dois quando `side === 'either'`) - reaproveite a mesma checagem que o
 * motor usa pra aceitar a ativação de verdade, nunca invente uma segunda
 * cópia da regra; `buildSelection` monta a `MagicSelection` exatamente como
 * o diálogo de clique já monta pro mesmo caso.
 */
import {
  getDestroyableReinforcementSlots,
  isBrotoSlot,
  isSlotProtected,
  playerKeyOf,
  type CharacterId,
  type GameState,
  type MagicSelection,
  type PlayerNumber,
} from './gameEngine';
import { hasStatus } from './statusEffects';
import type { MagicCardType } from './magicCards';

export interface DragActivationRule {
  side: 'own' | 'opponent' | 'either';
  isValidSlotTarget: (state: GameState, player: PlayerNumber, targetPlayer: PlayerNumber, slotIndex: number) => boolean;
  buildSelection: (state: GameState, player: PlayerNumber, targetPlayer: PlayerNumber, slotIndex: number) => MagicSelection;
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
  isValidSlotTarget: (state, _player, targetPlayer, slotIndex) => {
    if (isSlotProtected(state, targetPlayer, slotIndex)) return false;
    const slot = state[playerKeyOf(targetPlayer)].field[slotIndex];
    return Boolean(slot.faceDownCard) || slot.horizontalCards.length > 0;
  },
  buildSelection: (_state, _player, _targetPlayer, slotIndex) => ({ fireballLaunch: true, selectedTargetSlot: slotIndex }),
};

/**
 * Mago K - Destruição de Reforço: mesma checagem de elegibilidade que o
 * motor/diálogo usam - `getDestroyableReinforcementSlots` (gameEngine.ts),
 * que aceita tanto um reforço horizontal não batalhado QUANTO um marcador de
 * combate (`combatModifier`) ainda ativo sobre a carta principal, mesmo sem
 * nenhuma horizontal.
 *
 * FIX (bug real achado por auditoria): esta regra reimplementava só a METADE
 * antiga do critério (só "tem horizontal não batalhada"), de antes do FIX
 * "permita que o mago possa destruir marcadores" ser aplicado no motor e no
 * diálogo - arrastar sobre um slot válido-só-por-marcador era rejeitado em
 * silêncio pelo atalho de drag, embora clicar funcionasse normalmente.
 * Reaproveita a função exportada em vez de manter uma 2ª cópia da regra.
 */
const magoKRule: DragActivationRule = {
  side: 'opponent',
  isValidSlotTarget: (state, _player, targetPlayer, slotIndex) => {
    if (isSlotProtected(state, targetPlayer, slotIndex)) return false;
    return getDestroyableReinforcementSlots(state[playerKeyOf(targetPlayer)].field).includes(slotIndex);
  },
  buildSelection: (_state, _player, _targetPlayer, slotIndex) => ({ selectedSlot: slotIndex }),
};

/**
 * Anjo Q - Visão Celestial, só o modo "revelar slot de campo" (a magia tem
 * um 2º modo, revelar carta de mão, que continua só por clique - não tem
 * "slot" nenhum pra arrastar até).
 */
const anjoQFieldRule: DragActivationRule = {
  side: 'opponent',
  isValidSlotTarget: (state, _player, targetPlayer, slotIndex) => {
    const slot = state[playerKeyOf(targetPlayer)].field[slotIndex];
    if (!slot.faceDownCard || slot.revealed) return false;
    return !isSlotProtected(state, targetPlayer, slotIndex);
  },
  buildSelection: (_state, _player, _targetPlayer, slotIndex) => ({ selectedSlot: slotIndex }),
};

/**
 * Mosqueteiro K - Tiro Certeiro - MUDANÇA DE PLANOS (pedido do usuário):
 * antes reforçava uma carta do PRÓPRIO campo; agora enfraquece uma carta do
 * campo do OPONENTE (`selectedCards`, não `selectedSlot` - a ativação por
 * clique deixa escolher a principal OU uma horizontal específica dentro do
 * slot). Mesma checagem de Proteção Divina que o motor exige (ver
 * druidaKRule, o mesmo padrão de "marcador negativo no adversário"). Arrastar
 * e soltar sempre mira a carta PRINCIPAL do slot - simplificação deliberada
 * (soltar "no slot" não distingue qual das cartas dentro dele); mirar uma
 * horizontal específica continua exigindo o fluxo de clique.
 */
const mosqueteiroKRule: DragActivationRule = {
  side: 'opponent',
  isValidSlotTarget: (state, _player, targetPlayer, slotIndex) => {
    if (isSlotProtected(state, targetPlayer, slotIndex)) return false;
    return Boolean(state[playerKeyOf(targetPlayer)].field[slotIndex].faceDownCard);
  },
  buildSelection: (state, _player, targetPlayer, slotIndex) => ({
    selectedCards: [state[playerKeyOf(targetPlayer)].field[slotIndex].faceDownCard!.id],
  }),
};

/**
 * Druida Q - Simbiose, só o modo "marcador" (reduz o Broto pela metade pra
 * reforçar uma carta do PRÓPRIO campo - a opção "aumentar o Broto em 2" não
 * tem alvo nenhum, continua só por clique/pelo atalho de plantar/empilhar
 * via arrastar, ver isDruidaBrotoCard em gameEngine.ts). O próprio Broto
 * nunca é um alvo válido (ele já É a fonte do efeito - mesma regra que
 * handleExecuteMagic aplica). Mesma simplificação de mosqueteiroKRule:
 * arrastar sempre mira a carta PRINCIPAL do slot, nunca uma horizontal.
 */
const druidaQRule: DragActivationRule = {
  side: 'own',
  isValidSlotTarget: (state, _player, targetPlayer, slotIndex) => {
    const field = state[playerKeyOf(targetPlayer)].field;
    const slot = field[slotIndex];
    if (!slot.faceDownCard) return false;
    return !isBrotoSlot(slot);
  },
  buildSelection: (state, _player, targetPlayer, slotIndex) => ({
    selectedCards: [state[playerKeyOf(targetPlayer)].field[slotIndex].faceDownCard!.id],
  }),
};

/**
 * Druida K - Urtiga, mesmo modo "marcador" de druidaQRule, mirando o
 * OPONENTE (o Broto sempre está no PRÓPRIO campo, então nunca aparece do
 * lado do oponente - sem necessidade de excluí-lo aqui).
 */
const druidaKRule: DragActivationRule = {
  side: 'opponent',
  isValidSlotTarget: (state, _player, targetPlayer, slotIndex) => {
    if (isSlotProtected(state, targetPlayer, slotIndex)) return false;
    return Boolean(state[playerKeyOf(targetPlayer)].field[slotIndex].faceDownCard);
  },
  buildSelection: (state, _player, targetPlayer, slotIndex) => ({
    selectedCards: [state[playerKeyOf(targetPlayer)].field[slotIndex].faceDownCard!.id],
  }),
};

/**
 * Glacial K - Crioescudo, efeito de ESTRATÉGIA (NOVO, pedido do usuário:
 * "permita a ativação drag & drop no efeito da fase de estratégia") -
 * congela 1 carta PRÓPRIA no campo. Mesmo padrão de druidaQRule/druidaKRule
 * (`side: 'own'`, arrastar sempre mira a carta PRINCIPAL do slot - mirar uma
 * carta da MÃO continua exigindo o diálogo, ver o bloco "Glacial K" em
 * GameBoard.tsx: nenhuma outra magia deste jogo tem alvo de mão arrastável,
 * a mão nunca é uma zona de drop neste jogo, ver o comentário no topo deste
 * arquivo).
 *
 * A checagem `state.phase !== 'strategy'` é OBRIGATÓRIA aqui, mesmo com
 * `canActivateMagic` já sendo checado antes por quem chama esta regra
 * (GameBoard.tsx): o Rei também é ativável no COMBATE, mas por um motivo
 * TOTALMENTE diferente (`hasAnyFrozenFieldCard` - existe carta JÁ congelada
 * em jogo) que nada tem a ver com "este slot tem uma carta própria AINDA NÃO
 * congelada" (o critério daqui). Sem esta guarda, um drop no Combate
 * pareceria mirar aquele slot específico, mas handleExecuteMagic
 * (gameEngine.ts) ignora a seleção nessa fase e roda o efeito em MASSA
 * mesmo assim - o feedback visual do arraste mentiria sobre o que vai
 * acontecer.
 */
const glacialKRule: DragActivationRule = {
  side: 'own',
  isValidSlotTarget: (state, _player, targetPlayer, slotIndex) => {
    if (state.phase !== 'strategy') return false;
    const slot = state[playerKeyOf(targetPlayer)].field[slotIndex];
    return Boolean(slot.faceDownCard) && !hasStatus(slot.faceDownCard, 'frozen');
  },
  buildSelection: (_state, _player, _targetPlayer, slotIndex) => ({ selectedSlot: slotIndex }),
};

/**
 * Glacial J - Criogenar, só o modo "slot de campo" (a magia também aceita
 * mirar uma carta de MÃO, própria ou do oponente, que continua só por
 * clique - mesma exclusão parcial de anjoQFieldRule acima). Mira QUALQUER
 * um dos dois campos (`side: 'either'`, ver GameBoard.tsx, bloco "Glacial J"
 * do diálogo de clique: coluna "Seu Campo" e "Campo Oponente" lado a lado,
 * ambas habilitadas ao mesmo tempo) - a Proteção Divina só bloqueia o lado
 * do OPONENTE (`!isOwn && isSlotProtected`, o próprio campo nunca é
 * protegido contra o próprio dono).
 */
const glacialJFieldRule: DragActivationRule = {
  side: 'either',
  isValidSlotTarget: (state, player, targetPlayer, slotIndex) => {
    const isOwn = targetPlayer === player;
    if (!isOwn && isSlotProtected(state, targetPlayer, slotIndex)) return false;
    const slot = state[playerKeyOf(targetPlayer)].field[slotIndex];
    return Boolean(slot.faceDownCard) && !hasStatus(slot.faceDownCard, 'frozen');
  },
  buildSelection: (_state, _player, targetPlayer, slotIndex) => ({
    selectedSlot: slotIndex,
    selectedTargetPlayer: targetPlayer,
  }),
};

/**
 * Glacial Q - Crioespinho, mira QUALQUER um dos dois campos (`side:
 * 'either'`, mesmo padrão de glacialJFieldRule acima). A magia aceita
 * mirar a carta principal OU uma horizontal específica dentro do slot (ver
 * bloco "Glacial Q" do diálogo de clique em GameBoard.tsx); arrastar sempre
 * mira a carta PRINCIPAL do slot - mesma simplificação deliberada de
 * mosqueteiroKRule/druidaKRule acima (soltar "no slot" não distingue qual
 * carta dentro dele), mirar uma horizontal específica continua exigindo o
 * diálogo de clique.
 */
const glacialQRule: DragActivationRule = {
  side: 'either',
  isValidSlotTarget: (state, player, targetPlayer, slotIndex) => {
    const isOwn = targetPlayer === player;
    if (!isOwn && isSlotProtected(state, targetPlayer, slotIndex)) return false;
    const slot = state[playerKeyOf(targetPlayer)].field[slotIndex];
    return Boolean(slot.faceDownCard) && !hasStatus(slot.faceDownCard, 'frozen');
  },
  buildSelection: (state, _player, targetPlayer, slotIndex) => ({
    selectedSlot: slotIndex,
    selectedCards: [state[playerKeyOf(targetPlayer)].field[slotIndex].faceDownCard!.id],
    selectedTargetPlayer: targetPlayer,
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
  // FIX (pedido do usuário: "permita que todas magias que pedem seleção de
  // alvo apenas para sua ativação possam ser ativadas de imediato com
  // drag&drop no alvo correspondente") - Simbiose/Urtiga também se encaixam
  // no escopo original (seleção inteira = 1 carta de campo).
  'druida-Q': druidaQRule,
  'druida-K': druidaKRule,
  // FIX (mudança de efeito pedida pelo usuário: "permita a ativação drag &
  // drop no efeito da fase de estratégia") - Crioescudo (Rei do Glacial)
  // ganhou um efeito de Estratégia com alvo simples (1 slot de campo
  // próprio) que se encaixa no mesmo escopo.
  'glacial-K': glacialKRule,
  // FIX (pedido do usuário: "o drag & drop do glacial na parte das magias
  // não funciona") - Criogenar (J) e Crioespinho (Q) nunca tinham entrada
  // aqui; ambos miram "qualquer um dos dois campos" (`side: 'either'`, ver
  // comentário de glacialJFieldRule acima) - o primeiro caso real que
  // precisou desse 3º valor de `side`.
  'glacial-J': glacialJFieldRule,
  'glacial-Q': glacialQRule,
};

export function getDragActivationRule(character: CharacterId, magicType: MagicCardType): DragActivationRule | undefined {
  return DRAG_ACTIVATION_RULES[`${character}-${magicType}`];
}
