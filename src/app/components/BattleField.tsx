import { motion } from 'motion/react';
import { getCharacterTheme } from '../lib/characterThemes';
import type { FieldSlot, CharacterId } from '../lib/gameEngine';
import { FieldSlotView } from './FieldSlotView';
import type { CombatValueRevealSpec } from './CombatValueReveal';
import type { SpotlightState } from '../lib/spotlight';
import { FireballMeter } from './FireballMeter';

interface BattleFieldProps {
  player1Character: CharacterId;
  player2Character: CharacterId;
  player1Field: [FieldSlot, FieldSlot, FieldSlot];
  player2Field: [FieldSlot, FieldSlot, FieldSlot];
  onSlotClick: (playerNumber: 1 | 2, slotIndex: number) => void;
  onSlotDoubleClick?: (playerNumber: 1 | 2, slotIndex: number) => void;
  selectedSlot: { player: 1 | 2; slot: number } | null;
  phase: 'draw' | 'strategy' | 'combat';
  combatSelection: {
    player1?: number;
    player2?: number;
  };
  isSlotProtected: (playerNumber: 1 | 2, slotIndex: number) => boolean;
  /** Verdadeiro no modo "Contra a IA" ou no Modo Espectador: só muda o rótulo do campo do Jogador 2, e esconde os valores dela do tooltip (ver FIX do item 6 abaixo). */
  player2IsAi?: boolean;
  /** Modo Espectador (pedido do usuário: "IA vs IA") - mesma ideia de `player2IsAi`, agora também disponível pro Jogador 1 (em "Contra a IA" ele nunca é a IA, então fica `undefined`/false). */
  player1IsAi?: boolean;
  /**
   * FIX (item 2): permite soltar (drag-and-drop) uma carta da mão diretamente
   * sobre um slot do campo, além do fluxo por clique já existente. `asHorizontal`
   * indica se a carta foi solta na área de reforço horizontal (perto do canto do
   * slot) ou no slot principal.
   */
  onCardDrop?: (playerNumber: 1 | 2, slotIndex: number, cardId: string, asHorizontal: boolean) => void;

  /**
   * FIX (item 9 da 6ª rodada): "adicione a opção de remover a carta
   * horizontal de cima de outra carta, clicando onde normalmente sua
   * indicação visual é posicionada" - clicar na PRÓPRIA carta horizontal (a
   * mesma sobreposição no canto do slot que já mostra ela) a devolve para a
   * mão, sem mexer na carta principal (nem na outra horizontal, se houver
   * 2 empilhadas). Só oferecido no próprio campo do jogador humano, na fase
   * de Estratégia (mesma janela das outras ações de reposicionamento).
   */
  onRemoveHorizontalCard?: (playerNumber: 1 | 2, slotIndex: number, cardId: string) => void;

  /**
   * FIX (item 1 da 8ª rodada): a Zona Monstro de cada jogador saiu por
   * completo deste componente (ver MonsterZone.tsx e GameBoard.tsx) - este
   * campo de batalha não sabe mais nada sobre a carta Monstro em si, só
   * ainda precisa saber QUAL jogador está escolhendo um slot alvo pro efeito
   * dela, pra destacar visualmente os 3 slots normais (ver abaixo).
   */
  monsterTargetSelection?: { playerNumber: 1 | 2 } | null;
  /**
   * FIX (item 5 da 4ª rodada): "os efeitos de magia deviam ter efeitos
   * visuais no campo e na mão (caso sejam os alvos)". Lista dos slots do
   * campo (de qualquer jogador) que acabaram de ser alvo de uma magia ou do
   * efeito do Monstro - GameBoard.tsx preenche isso no momento exato do
   * dispatch (onde os alvos já são conhecidos, vindos da seleção do próprio
   * diálogo de magia) e limpa de novo após ~1s. Ver MagicEffectBurst.tsx.
   */
  effectFlashSlots?: Array<{ player: 1 | 2; slotIndex: number }>;
  /**
   * Piromante (personagem novo, pedido do usuário: "as magias do piromante
   * mal tem efeitos visuais, especialmente quanto a cartas queimar") -
   * repassado direto pra FieldSlotView.tsx, que agora também usa esta
   * mesma lista (já existente em GameBoard.tsx pra cartas na mão via
   * PlayerZone.tsx) pra destacar uma carta HORIZONTAL específica do campo -
   * `effectFlashSlots` acima só cobre o slot inteiro/a carta principal,
   * nunca uma horizontal isolada (ver Queima do Reforço do Piromante, que
   * sempre mira exatamente uma horizontal do oponente).
   */
  effectFlashCardIds?: string[];
  /**
   * FIX (pedido do usuário, item 9): "luz ambiente na mesa que reage à cor
   * do personagem da vez" - a mesa (este container inteiro) ganha um brilho
   * ambiente na cor do personagem que AINDA NÃO está pronto (o jogador cuja
   * ação está pendente agora) - dá uma pista visual de "de quem é a vez" sem
   * precisar ler texto. Quando os dois estão prontos (ou os dois ainda não),
   * cai num dourado neutro.
   */
  player1Ready?: boolean;
  player2Ready?: boolean;
  /**
   * FIX (pedido do usuário: "mais efeitos visuais nas magias... mostrando
   * uma referência de seus atos"): personagem de quem ATIVOU a magia/efeito
   * de Monstro atualmente em exibição (não o dono do slot!) e o nome dela -
   * repassados para FieldSlotView.tsx, que os usa em CharacterMagicBurst.tsx
   * (motivo/cor do personagem certo) e MagicCalloutLabel.tsx (nome da
   * magia), só no(s) slot(s) marcado(s) por `effectFlashSlots`.
   */
  activeMagicCaster?: CharacterId | null;
  activeMagicLabel?: string | null;
  /** FIX (pedido do usuário, item 5): slot que acabou de ser destruído pela Destruição de Reforço do Mago - repassado para FieldSlotView.tsx (CardShatterBurst.tsx) em vez do burst normal. */
  shatteringSlot?: { player: 1 | 2; slotIndex: number } | null;
  /** Coringa (redesenho completo, "armadilhas"): slot que acabou de ter um Valete/Rei armadilha reagindo (dissipando em fumaça) - repassado para FieldSlotView.tsx (CoringaSmokeBurst.tsx) em vez do burst normal. */
  smokingSlot?: { player: 1 | 2; slotIndex: number } | null;
  /**
   * Piromante (personagem novo, pedido explícito do usuário: "carta pegando
   * fogo e se despedaçando") - slot(s) do campo do OPONENTE que acabaram de
   * ser atingidos por um lançamento da Bola de Fogo - repassado para
   * FieldSlotView.tsx (FireShatterBurst.tsx) em vez do burst normal. É uma
   * LISTA (não um único slot como shatteringSlot/smokingSlot acima) porque a
   * Magia Numeral "Chama Repartida" pode acertar os 3 slots do oponente de
   * uma vez.
   */
  burningSlots?: Array<{ player: 1 | 2; slotIndex: number }>;
  /**
   * Efeitos de status contínuos (pedido do usuário: "mais efeitos visuais
   * nas magias... como você fez nas torres") - id da carta (principal OU
   * horizontal) atualmente sob a Fúria Selvagem da Besta (valendo o dobro),
   * de CADA jogador - undefined quando nenhuma carta dele está dobrada
   * agora. Repassado pra FieldSlotView.tsx aplicar a aura/partículas
   * vermelhas + selo "x2" na carta certa (ver monsterTargetCardId em
   * gameEngine.ts - dura até a próxima fase de Compra, não só um instante).
   */
  player1DoubledCardId?: string;
  player2DoubledCardId?: string;
  /**
   * Mosqueteiro (personagem novo) - id da carta (principal OU horizontal)
   * reforçada pelo Tiro Certeiro (Rei), de CADA jogador - mesmo padrão de
   * player1/2DoubledCardId acima, com o valor extra (`mosqueteiroBoostAmount`)
   * junto pra desenhar o selo "+N" certo (ver mosqueteiroBoostedCardId em
   * gameEngine.ts).
   */
  player1BoostedCardId?: string;
  player1BoostAmount?: number;
  player2BoostedCardId?: string;
  player2BoostAmount?: number;
  /** Modo Spotlight (pedido do usuário) - repassado pra FieldSlotView.tsx (selo de palavra-chave, total de Torre) - ver spotlight.ts. */
  spotlight?: SpotlightState | null;
  /**
   * FIX (pedido do usuário: "quando eu disse querer que os números
   * aparecessem no meio, eu quis dizer do lado das duas espadas, um na
   * esquerda e um na direita, não no literal meio da tela") - os 2 valores
   * revelados de uma disputa de combate em andamento (preenchido por
   * GameBoard.tsx só entre "a resolução chegou" e "o popup de vencedor
   * assume a cena"), desenhados ladeando o ícone de espadas do divisor
   * central abaixo - `null` na maior parte do tempo (nenhuma disputa sendo
   * revelada agora).
   */
  combatValueSpec?: CombatValueRevealSpec | null;
  /**
   * Modo Towers (pedido do usuário: "faça com que o botão de empilhar surja
   * abaixo dos campos das 3 cartas... dentro do campo do meio, ao invés de
   * aparecer na mão") - o botão de confirmar a torre morava perto da mão
   * (PlayerZone.tsx); agora mora aqui, numa linha extra logo abaixo dos 3
   * slots de combate de cada jogador, alinhada só sob o slot do MEIO (índice
   * 1) via a mesma grade `grid-cols-3` dos slots - as outras 2 colunas ficam
   * vazias, então o botão aparece centralizado, sem precisar de nenhum
   * cálculo de posição manual.
   */
  towersMode?: boolean;
  selectedForTower?: Set<string>;
  onFormTower?: (playerNumber: 1 | 2, slotIndex: number) => void;
  canFormTower?: (playerNumber: 1 | 2, slotIndex: number) => boolean;
  /**
   * Piromante (personagem novo) - Bola de Fogo de CADA jogador, mostrada
   * como um círculo com fogo contínuo ancorado na borda do campo do lado
   * dele (FireballMeter.tsx), sempre visível (não é um efeito temporário) -
   * `undefined` para o jogador que não é Piromante (nenhum círculo
   * aparece). `fireballCap` é o mesmo teto pros dois (20, ou 30 no modo
   * Towers - getFireballCap em gameEngine.ts).
   */
  player1FireballValue?: number;
  player2FireballValue?: number;
  fireballCap?: number;
  player1SpreadArmed?: boolean;
  player2SpreadArmed?: boolean;
}

export function BattleField({
  player1Character,
  player2Character,
  player1Field,
  player2Field,
  onSlotClick,
  onSlotDoubleClick,
  selectedSlot,
  phase,
  combatSelection,
  isSlotProtected,
  player2IsAi = false,
  player1IsAi = false,
  onCardDrop,
  onRemoveHorizontalCard,
  monsterTargetSelection,
  effectFlashSlots,
  effectFlashCardIds,
  player1Ready = false,
  player2Ready = false,
  activeMagicCaster,
  activeMagicLabel,
  shatteringSlot,
  smokingSlot,
  burningSlots,
  player1DoubledCardId,
  player2DoubledCardId,
  player1BoostedCardId,
  player1BoostAmount,
  player2BoostedCardId,
  player2BoostAmount,
  combatValueSpec,
  spotlight,
  towersMode = false,
  selectedForTower,
  onFormTower,
  canFormTower,
  player1FireballValue,
  player2FireballValue,
  fireballCap,
  player1SpreadArmed,
  player2SpreadArmed,
}: BattleFieldProps) {
  const p1Theme = getCharacterTheme(player1Character);
  const p2Theme = getCharacterTheme(player2Character);
  const ambientGlowColor = !player1Ready && player2Ready
    ? p1Theme.primary
    : !player2Ready && player1Ready
    ? p2Theme.primary
    : '#C59E4F';

  const renderField = (
    playerNumber: 1 | 2,
    field: [FieldSlot, FieldSlot, FieldSlot],
    theme: ReturnType<typeof getCharacterTheme>
  ) => {
    // FIX (item 6): valores do próprio campo do jogador humano nunca deveriam
    // vazar quando esse campo é o da IA (ou, no futuro, de um oponente online) -
    // antes o tooltip de valor real (abaixo) não fazia nenhuma distinção entre
    // "meu campo" e "campo do oponente/IA".
    const isAiField = playerNumber === 2 ? player2IsAi : player1IsAi;
    const doubledCardId = playerNumber === 1 ? player1DoubledCardId : player2DoubledCardId;
    const boostedCardId = playerNumber === 1 ? player1BoostedCardId : player2BoostedCardId;
    const boostAmount = playerNumber === 1 ? player1BoostAmount : player2BoostAmount;

    return (
      // FIX (item 4 da 6ª rodada; item 1 da 8ª rodada): era grid-cols-4 (3
      // Slots + Zona Monstro como 4ª célula) - agora só os 3 Slots de
      // combate ficam aqui; a Zona Monstro saiu completamente deste
      // componente (ver MonsterZone.tsx, renderizado por GameBoard.tsx na
      // coluna lateral).
      <div className="grid grid-cols-3 gap-6 justify-items-center">
        {field.map((slot, i) => (
          <FieldSlotView
            key={i}
            playerNumber={playerNumber}
            slotIndex={i}
            slot={slot}
            theme={theme}
            isAiField={isAiField}
            isSelected={selectedSlot?.player === playerNumber && selectedSlot?.slot === i}
            isCombatSelected={combatSelection[`player${playerNumber}` as 'player1' | 'player2'] === i}
            isMonsterTargetChoice={monsterTargetSelection?.playerNumber === playerNumber}
            isEffectFlashing={Boolean(effectFlashSlots?.some((t) => t.player === playerNumber && t.slotIndex === i))}
            effectFlashCardIds={effectFlashCardIds}
            protectedSlot={isSlotProtected(playerNumber, i)}
            phase={phase}
            onSlotClick={onSlotClick}
            onSlotDoubleClick={onSlotDoubleClick}
            onCardDrop={onCardDrop}
            onRemoveHorizontalCard={onRemoveHorizontalCard}
            activeMagicCaster={activeMagicCaster}
            activeMagicLabel={activeMagicLabel}
            isShattering={Boolean(shatteringSlot && shatteringSlot.player === playerNumber && shatteringSlot.slotIndex === i)}
            isSmoking={Boolean(smokingSlot && smokingSlot.player === playerNumber && smokingSlot.slotIndex === i)}
            isBurning={Boolean(burningSlots?.some((s) => s.player === playerNumber && s.slotIndex === i))}
            doubledCardId={doubledCardId}
            boostedCardId={boostedCardId}
            boostAmount={boostAmount}
            spotlight={spotlight}
          />
        ))}
      </div>
    );
  };

  // Modo Towers - linha de confirmação abaixo dos 3 slots de combate do
  // jogador, alinhada só sob o slot do meio (ver comentário completo em
  // BattleFieldProps). `isAiField` bloqueia o botão no campo controlado pela
  // IA (ela confirma a própria torre sozinha, sem UI).
  const renderTowerConfirmRow = (playerNumber: 1 | 2, isAiField: boolean) => {
    if (!towersMode || phase !== 'strategy' || isAiField) return null;
    if (!selectedForTower || selectedForTower.size === 0) return null;
    if (!selectedSlot || selectedSlot.player !== playerNumber) return null;
    const canForm = Boolean(canFormTower?.(playerNumber, selectedSlot.slot));
    return (
      <div className="grid grid-cols-3 gap-6 justify-items-center">
        <div />
        <button
          onClick={() => canForm && onFormTower?.(playerNumber, selectedSlot.slot)}
          disabled={!canForm}
          className="w-full px-3 py-1.5 rounded-lg border-2 transition-all hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          style={{ backgroundColor: '#7AA7C4', borderColor: '#7AA7C4', color: '#0F1113' }}
        >
          <div className="flex items-center justify-center gap-1">
            <span className="text-[14px]">🗼</span>
            <span className="text-[10px]">Empilhar {selectedForTower.size} carta(s) - Slot {selectedSlot.slot + 1}</span>
          </div>
        </button>
        <div />
      </div>
    );
  };

  return (
    <div
      className="bg-[#1E1A16] border-2 rounded-lg p-6 space-y-8 transition-[box-shadow,border-color] duration-700 ease-out"
      style={{
        borderColor: `${ambientGlowColor}4D`,
        boxShadow: `0 0 55px ${ambientGlowColor}30, inset 0 0 90px ${ambientGlowColor}14`,
      }}
    >
      {/* Campo do Jogador 2 (topo) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {player2Character === 'piromante' && player2FireballValue !== undefined && (
            <FireballMeter value={player2FireballValue} cap={fireballCap ?? 20} spreadArmed={player2SpreadArmed} playerNumber={2} />
          )}
          <div className="h-px flex-1 bg-gradient-to-r from-transparent" style={{ background: `linear-gradient(to right, transparent, ${p2Theme.primary}40)` }} />
          <p className="text-[11px] uppercase tracking-wider" style={{ color: p2Theme.primary }}>
            {p2Theme.name} - Campo{player2IsAi ? ' (IA)' : ''}
          </p>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent" style={{ background: `linear-gradient(to left, transparent, ${p2Theme.primary}40)` }} />
        </div>
        {renderField(2, player2Field, p2Theme)}
        {renderTowerConfirmRow(2, player2IsAi)}
      </div>

      {/* Divisor central (item 4 da 6ª rodada; reajustado nos itens 1 e 3 da
          7ª rodada; FIX item 1 da 8ª rodada: as duas Zonas Monstro que
          ficavam coladas aqui, dentro deste card do campo, saíram por
          completo daqui - ver MonsterZone.tsx, agora renderizado por
          GameBoard.tsx na coluna lateral direita, fora do "campo").
          FIX (pedido do usuário: "quando eu disse querer que os números
          aparecessem no meio, eu quis dizer do lado das duas espadas, um na
          esquerda e um na direita, não no literal meio da tela") - os 2
          valores de `combatValueSpec` (ver BattleFieldProps) aparecem bem
          aqui, ladeando o ícone de espadas, em vez de num overlay separado
          cobrindo o centro da tela inteira (ver CombatValueReveal.tsx). */}
      <div className="relative flex items-center justify-center w-full py-1">
        <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#C59E4F] to-transparent" />
        <div className="relative bg-[#1E1A16] px-4 flex items-center gap-3">
          {combatValueSpec && (
            <motion.span
              className="font-display text-[26px] leading-none"
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
              style={{
                color: getCharacterTheme(combatValueSpec.p1Character).primary,
                fontWeight: combatValueSpec.winner === 1 ? 700 : 400,
                textShadow: '0 2px 10px rgba(0,0,0,0.85)',
              }}
            >
              {combatValueSpec.p1Value}
            </motion.span>
          )}
          <div className="text-[#C59E4F] text-[24px] font-display">⚔</div>
          {combatValueSpec && (
            <motion.span
              className="font-display text-[26px] leading-none"
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
              style={{
                color: getCharacterTheme(combatValueSpec.p2Character).primary,
                fontWeight: combatValueSpec.winner === 2 ? 700 : 400,
                textShadow: '0 2px 10px rgba(0,0,0,0.85)',
              }}
            >
              {combatValueSpec.p2Value}
            </motion.span>
          )}
        </div>
      </div>

      {/* Campo do Jogador 1 (base) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {player1Character === 'piromante' && player1FireballValue !== undefined && (
            <FireballMeter value={player1FireballValue} cap={fireballCap ?? 20} spreadArmed={player1SpreadArmed} playerNumber={1} />
          )}
          <div className="h-px flex-1 bg-gradient-to-r from-transparent" style={{ background: `linear-gradient(to right, transparent, ${p1Theme.primary}40)` }} />
          <p className="text-[11px] uppercase tracking-wider" style={{ color: p1Theme.primary }}>
            {p1Theme.name} - Campo{player1IsAi ? ' (IA)' : ''}
          </p>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent" style={{ background: `linear-gradient(to left, transparent, ${p1Theme.primary}40)` }} />
        </div>
        {renderField(1, player1Field, p1Theme)}
        {renderTowerConfirmRow(1, player1IsAi)}
      </div>
    </div>
  );
}
