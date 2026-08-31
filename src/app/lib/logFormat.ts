/**
 * logFormat.ts - Apresentação do Log de Ações
 *
 * FIX (pedido do usuário: "reformule completamente o sistema de log de
 * jogo... a lógica do jogo pare de conhecer cores/formatação") - antes toda
 * cor, ícone e nome+tooltip de magia/efeito era montado como HTML dentro do
 * PRÓPRIO gameEngine.ts (appendLog fazia regex sobre a mensagem pra colorir
 * trechos). Este arquivo centraliza essa responsabilidade do lado da UI:
 * dado um LogEntry (dado 100% estruturado, texto plano, sem HTML - ver
 * gameEngine.ts), decide ícone, cor e nome/descrição oficial (quando
 * aplicável) pra exibir. Usado tanto pelo painel de log (LogPanel.tsx)
 * quanto pela notificação toast de magia/efeito (GameBoard.tsx) - um único
 * lugar pra essa lógica, em vez de duplicada nos dois.
 */
import { getCharacterTheme } from './characterThemes';
import { getMagicCardInfo } from './magicCards';
import { getMonsterEffect } from './monsterCards';
import { getNumeralSpellInfo } from './numeralSpells';
import type { CharacterId, LogEntry, LogEventType, PlayerNumber } from './gameEngine';

/** Ícone padrão por categoria - usado no painel de log e na notificação toast. */
const TYPE_ICONS: Record<LogEventType, string> = {
  system: '🔀',
  phase: '📖',
  draw: '📥',
  discard: '🗑️',
  fusion: '🔗',
  ace: '🎴',
  magic: '✨',
  'numeral-spell': '🌟',
  monster: '🃏',
  field: '🛡️',
  combat: '⚔️',
  warning: '⚠️',
  spotlight: '🧊',
};

/**
 * Ícone de uma entrada específica - normalmente só o ícone da categoria
 * (TYPE_ICONS), mas o resultado de uma DISPUTA (não só um combate comum)
 * ganha um troféu, pra distinguir visualmente os dois na mesma categoria
 * 'combat' sem precisar de um LogEventType novo só pra isso.
 */
export function getLogIcon(entry: LogEntry): string {
  if (entry.type === 'combat' && entry.text.includes('DISPUTA')) return '🏆';
  return TYPE_ICONS[entry.type];
}

/** Cor de destaque de uma entrada - a cor do personagem do jogador dono, ou undefined para eventos globais/sem dono. */
export function getLogColor(entry: LogEntry, characterOfPlayer: (player: PlayerNumber) => CharacterId): string | undefined {
  if (entry.player === null) return undefined;
  return getCharacterTheme(characterOfPlayer(entry.player)).primary;
}

/**
 * Nome oficial + descrição completa do efeito mencionado nesta entrada
 * (quando aplicável) - usado pro painel de log prefixar "Valete - Benção
 * Divina: ..." (com tooltip da descrição completa), mesmo tratamento que o
 * antigo appendLog dava só para magias, agora estendido a efeitos de
 * Monstro e Magia Numeral. Retorna null quando a entrada não é desse tipo
 * (nada a prefixar).
 */
export function getLogEffectInfo(
  entry: LogEntry,
  characterOfPlayer: (player: PlayerNumber) => CharacterId
): { name: string; description: string } | null {
  if (entry.player === null) return null;
  const character = characterOfPlayer(entry.player);

  if (entry.type === 'magic' && (entry.cardValue === 'J' || entry.cardValue === 'Q' || entry.cardValue === 'K')) {
    const info = getMagicCardInfo(character, entry.cardValue);
    return { name: info.name, description: info.description };
  }

  // FIX (bug encontrado em teste manual): 'monster' cobre TANTO posicionar a
  // carta na zona própria QUANTO ativar o efeito dela - só a ativação deveria
  // ganhar o prefixo "Nome do Efeito: ..."; a colocação já é autoexplicativa
  // ("posicionou uma carta Monstro..."). A colocação é a ÚNICA que marca
  // `cardValue: '🃏'` (ver handlePlaceMonsterCard, gameEngine.ts) - por isso
  // usa isso como diferencial, em vez de tentar ler o texto da mensagem.
  if (entry.type === 'monster' && entry.cardValue === undefined) {
    const effect = getMonsterEffect(character);
    return { name: effect.name, description: effect.detailedDescription };
  }

  // Mesma lógica pro tipo 'numeral-spell': cobre a ativação E várias outras
  // mensagens de acompanhamento (efeito expirou, cartas reveladas...) - só a
  // linha de ATIVAÇÃO marca `cardValue` (o número exigido, como string - ver
  // handleActivateNumeralSpell), então só ela ganha o prefixo do nome.
  if (entry.type === 'numeral-spell' && entry.cardValue !== undefined) {
    const info = getNumeralSpellInfo(character);
    return { name: info.name, description: info.description };
  }

  return null;
}

/** Rótulo em português de cada categoria - usado nos filtros e em qualquer lugar que precise nomear o tipo. */
export const LOG_TYPE_LABELS: Record<LogEventType, string> = {
  system: 'Sistema',
  phase: 'Fase',
  draw: 'Compra',
  discard: 'Descarte',
  fusion: 'Fusão',
  ace: 'Ás',
  magic: 'Magia',
  'numeral-spell': 'Magia Numeral',
  monster: 'Monstro',
  field: 'Campo',
  combat: 'Combate',
  warning: 'Aviso',
  spotlight: 'Spotlight',
};

/**
 * FIX (pedido do usuário: "filtros por jogador e tipo de evento") - agrupa
 * as 12 categorias internas em 6 "baldes" pra filtro, um número de opções
 * que cabe confortavelmente numa barra de chips sem virar uma parede de
 * checkboxes. O ícone de cada balde é só o da categoria mais representativa
 * (não muda o ícone de cada linha, que continua vindo de getLogIcon).
 */
export interface LogFilterBucket {
  id: string;
  label: string;
  icon: string;
  types: LogEventType[];
}

export const LOG_FILTER_BUCKETS: LogFilterBucket[] = [
  { id: 'draw-discard', label: 'Compra/Descarte', icon: '📥', types: ['draw', 'discard'] },
  { id: 'fusion-ace', label: 'Fusão/Ás', icon: '🔗', types: ['fusion', 'ace'] },
  { id: 'magic', label: 'Magias', icon: '✨', types: ['magic', 'numeral-spell', 'monster'] },
  { id: 'field-combat', label: 'Campo/Combate', icon: '⚔️', types: ['field', 'combat'] },
  { id: 'system-phase', label: 'Fases/Sistema', icon: '📖', types: ['system', 'phase', 'spotlight'] },
  { id: 'warning', label: 'Avisos', icon: '⚠️', types: ['warning'] },
];
