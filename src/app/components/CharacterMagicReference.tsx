import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { getCharacterTheme } from '../lib/characterThemes';
import { getMagicCardInfo, canActivateMagic, type Character, type MagicCardType } from '../lib/magicCards';
import { getNumeralSpellInfo, formatNumeralRequirement, getMatchingNumeralCards, canActivateNumeralSpell } from '../lib/numeralSpells';
import { getMonsterEffect } from '../lib/monsterCards';
import { PHASE_DISPLAY } from './PlayingCard';
import { playerKeyOf, getMagicActivationContext, type GameState, type PlayerNumber } from '../lib/gameEngine';

interface CharacterMagicReferenceProps {
  character: Character;
  /** Estado completo do jogo e de qual jogador esta caixa é - usados pra saber se cada selo já pode ser ativado AGORA (ver FIX abaixo). */
  gameState: GameState;
  playerNumber: PlayerNumber;
}

/** Estado visual de um selo: sem a carta na mão (apagado), com ela mas ainda não dá pra ativar (normal), ou pronto pra ativar agora (brilhando). */
type BadgeReadiness = 'unavailable' | 'idle' | 'ready';

const READINESS_CLASSES: Record<BadgeReadiness, string> = {
  unavailable: 'opacity-30',
  idle: '',
  ready: 'rune-glow animate-pulse',
};

/**
 * CharacterMagicReference - caixa de referência rápida das magias (J/Q/K),
 * da Magia Numeral e do efeito de Monstro do personagem que um jogador está
 * usando.
 *
 * FIX (item 2 da 5ª rodada): "coloque uma caixa de texto explicando os
 * efeitos de cada magia do personagem que estão utilizando" perto da região
 * do baralho/descarte - uma para o jogador de cima (IA) acima dela e outra
 * para o jogador de baixo (humano) abaixo dela (ver GameBoard.tsx, onde este
 * componente é usado duas vezes).
 *
 * FIX de layout (mesma rodada): a 1ª versão listava J/Q/K/Numeral empilhados
 * (uma linha de texto por magia), o que quase dobrava a altura da coluna
 * lateral e derrubava a caixa de baixo (a do Jogador 1) para fora da tela em
 * viewports comuns (~1200px de altura) - só aparecia rolando a coluna. Agora
 * é UMA linha só de selos compactos; o nome e a descrição completa de cada
 * magia aparecem num tooltip ao passar o mouse, mesmo padrão já usado no
 * resto do jogo (cartas de magia na mão, Zona Monstro, badge da Magia
 * Numeral ativa).
 *
 * FIX (item 2 da 7ª rodada): "as outras 4 magias estão presentes" mas
 * faltava um selo pro efeito de Monstro (5ª habilidade do personagem) -
 * adicionado o selo 🃏 ao final da fileira, mesmo padrão dos outros 4.
 *
 * FIX (itens 6/7/8 do Grupo B da lista de afazeres, "os selos são só
 * referência estática"): antes cada selo tinha SEMPRE a mesma cor/borda,
 * não importa se a carta estava na mão, ativável agora, ou nem existia mais
 * - virou puro texto decorativo depois da primeira olhada. Agora recebe
 * `gameState`+`playerNumber` (a mesma dupla que qualquer decisão real do
 * jogo usa) e cada selo reage: apagado sem a carta na mão, cor normal com a
 * carta mas fora de hora, e um brilho pulsante (`rune-glow`, mesmo efeito já
 * usado na Zona Monstro pronta) quando dá pra ativar JÁ - um resumo visual
 * de "o que dá pra fazer agora" sem abrir a mão. O selo da Magia Numeral
 * também ganha um contador "X/3" de progresso, e a borda de toda a caixa
 * usa a cor do próprio personagem em vez do dourado genérico de sempre.
 */
export function CharacterMagicReference({ character, gameState, playerNumber }: CharacterMagicReferenceProps) {
  const theme = getCharacterTheme(character);
  const magicTypes: MagicCardType[] = ['J', 'Q', 'K'];
  const numeralInfo = getNumeralSpellInfo(character);
  const monsterEffect = getMonsterEffect(character);

  const playerState = gameState[playerKeyOf(playerNumber)];
  const activationCtx = getMagicActivationContext(gameState, playerNumber);

  const monsterCard = playerState.monsterCard;
  const monsterReadiness: BadgeReadiness = !monsterCard ? 'unavailable' : monsterCard.monsterUsed ? 'unavailable' : 'ready';

  const matchedNumeralCount = Math.min(getMatchingNumeralCards(character, playerState.hand, gameState.spotlight).length, numeralInfo.requiredNumbers.length);
  const numeralReady =
    gameState.phase === 'strategy' &&
    canActivateNumeralSpell(character, playerState.hand, playerState.field, gameState.activeNumeralSpells[playerNumber] !== undefined, gameState.spotlight);
  const numeralReadiness: BadgeReadiness = numeralReady ? 'ready' : matchedNumeralCount > 0 ? 'idle' : 'unavailable';

  return (
    <div className="bg-[#1E1A16]/50 rounded-lg p-3" style={{ border: `1px solid ${theme.primary}33` }}>
      <p className="text-[11px] text-[#BFB6A6] mb-2">
        Magias de <span style={{ color: theme.primary }}>{theme.name}</span>
      </p>
      <div className="flex items-center gap-2">
        {magicTypes.map((type) => {
          const info = getMagicCardInfo(character, type);
          const hasCard = playerState.hand.some((c) => c.value === type);
          const readyNow = hasCard && canActivateMagic(gameState.phase, character, type, activationCtx);
          const readiness: BadgeReadiness = readyNow ? 'ready' : hasCard ? 'idle' : 'unavailable';
          return (
            <TooltipProvider key={type}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`w-7 h-7 rounded flex items-center justify-center text-[12px] font-bold cursor-help transition-opacity ${READINESS_CLASSES[readiness]}`}
                    style={{ color: theme.primary, border: `1px solid ${theme.primary}` }}
                  >
                    {type}
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-[#1E1A16] border-[#C59E4F] max-w-[240px]">
                  <p className="text-[#EFE7D6] text-[11px] font-semibold mb-1">{info.name}</p>
                  <p
                    className="text-[10px] font-semibold mb-1 uppercase tracking-wide"
                    style={{ color: PHASE_DISPLAY[info.phase].color }}
                  >
                    {PHASE_DISPLAY[info.phase].label}
                  </p>
                  <p className="text-[#EFE7D6] text-[11px]">{info.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}

        <div className="w-px h-6 bg-[#C59E4F]/20" />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`relative w-7 h-7 rounded flex items-center justify-center text-[12px] cursor-help transition-opacity ${READINESS_CLASSES[numeralReadiness]}`}
                style={{ color: theme.primary, border: `1px solid ${theme.primary}` }}
              >
                🌟
                <span
                  className="absolute -bottom-1.5 -right-1.5 bg-[#1E1A16] border border-[#C59E4F]/50 rounded-full text-[7px] w-4 h-4 flex items-center justify-center"
                  style={{ color: theme.primary }}
                >
                  {matchedNumeralCount}/{numeralInfo.requiredNumbers.length}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-[#1E1A16] border-[#C59E4F] max-w-[240px]">
              <p className="text-[#EFE7D6] text-[11px] font-semibold mb-1">
                {numeralInfo.name} ({formatNumeralRequirement(numeralInfo)})
              </p>
              <p className="text-[#EFE7D6] text-[11px]">{numeralInfo.description}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="w-px h-6 bg-[#C59E4F]/20" />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`w-7 h-7 rounded flex items-center justify-center text-[12px] cursor-help transition-opacity ${READINESS_CLASSES[monsterReadiness]}`}
                style={{ color: theme.primary, border: `1px solid ${theme.primary}` }}
              >
                🃏
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-[#1E1A16] border-[#C59E4F] max-w-[240px]">
              <p className="text-[#EFE7D6] text-[11px] font-semibold mb-1">{monsterEffect.name} (Monstro)</p>
              <p className="text-[#EFE7D6] text-[11px]">{monsterEffect.detailedDescription}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
