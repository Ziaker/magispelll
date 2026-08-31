import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { getCharacterTheme } from '../lib/characterThemes';
import { getMagicCardInfo, type Character, type MagicCardType } from '../lib/magicCards';
import { getNumeralSpellInfo, formatNumeralRequirement } from '../lib/numeralSpells';
import { getMonsterEffect } from '../lib/monsterCards';
import { PHASE_DISPLAY } from './PlayingCard';

interface CharacterMagicReferenceProps {
  character: Character;
}

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
 */
export function CharacterMagicReference({ character }: CharacterMagicReferenceProps) {
  const theme = getCharacterTheme(character);
  const magicTypes: MagicCardType[] = ['J', 'Q', 'K'];
  const numeralInfo = getNumeralSpellInfo(character);
  // FIX (item 2 da 7ª rodada): "as outras 4 magias estão presentes" mas o
  // Monstro (5ª habilidade do personagem) não tinha nenhum selo aqui - só a
  // Zona Monstro no campo já mostrava seu tooltip. Adicionado o mesmo padrão
  // de selo compacto + tooltip rico usado pelas outras 4, reaproveitando
  // getMonsterEffect (a mesma fonte de dados já usada pelo tooltip da Zona
  // Monstro em BattleField.tsx).
  const monsterEffect = getMonsterEffect(character);

  return (
    <div className="bg-[#1E1A16]/50 border border-[#C59E4F]/20 rounded-lg p-3">
      <p className="text-[11px] text-[#BFB6A6] mb-2">
        Magias de <span style={{ color: theme.primary }}>{theme.name}</span>
      </p>
      <div className="flex items-center gap-2">
        {magicTypes.map((type) => {
          const info = getMagicCardInfo(character, type);
          return (
            <TooltipProvider key={type}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center text-[12px] font-bold cursor-help"
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
                className="w-7 h-7 rounded flex items-center justify-center text-[12px] cursor-help"
                style={{ color: theme.primary, border: `1px solid ${theme.primary}` }}
              >
                🌟
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-[#1E1A16] border-[#C59E4F] max-w-[240px]">
              <p className="text-[#EFE7D6] text-[11px] font-semibold mb-1">
                {numeralInfo.name} ({formatNumeralRequirement(numeralInfo)}, {formatNumeralRequirement(numeralInfo)}, {formatNumeralRequirement(numeralInfo)})
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
                className="w-7 h-7 rounded flex items-center justify-center text-[12px] cursor-help"
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
