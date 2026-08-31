import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { Trophy, Swords, Heart } from 'lucide-react';
import { getCharacterTheme } from '../lib/characterThemes';
import { useSettings } from '../context/SettingsContext';
import type { CharacterId } from '../lib/gameEngine';

/** Converte a cor hex do tema (`#RRGGBB`) num par de tons p/ o confete (a própria cor + uma versão clara dela). */
function confettiColorsFor(hex: string): string[] {
  return [hex, '#EFE7D6', '#C59E4F'];
}

interface CombatResultProps {
  show: boolean;
  winner: 1 | 2 | 'tie' | null;
  player1Character: CharacterId;
  player2Character: CharacterId;
  player1Value?: number;
  player2Value?: number;
  // FIX (item 11): vencer UM combate só soma 1 ponto para uma "disputa" que
  // precisa de 2 vitórias para de fato custar 1 vida do oponente (ver
  // handleResolveCombat em gameEngine.ts - esse sistema de disputa já existe
  // há tempos e tem testes próprios, ex. testCombatDisputeNoDuplication em
  // sanity-test.ts). O problema não era a lógica em si (verificado
  // exaustivamente - funciona corretamente nos dois sentidos, com o jogador
  // ou a IA vencendo/vira primeiro) e sim que ESTE popup, que aparece igual
  // para TODO combate vencido, nunca deixava claro se aquela vitória já
  // custou uma vida do oponente ou se era só a 1ª de 2 necessárias - por
  // isso parecia que "a vitória não contava e não tirava coração": na
  // maioria das vezes ela realmente ainda não devia tirar (só a 2ª vitória
  // da disputa tira). Agora o popup distingue claramente os dois casos.
  disputeWinner?: 1 | 2 | null;
  winnerCombatWins?: number;
}

export function CombatResult({
  show,
  winner,
  player1Character,
  player2Character,
  player1Value,
  player2Value,
  disputeWinner,
  winnerCombatWins,
}: CombatResultProps) {
  const { settings } = useSettings();
  const p1Theme = getCharacterTheme(player1Character);
  const p2Theme = getCharacterTheme(player2Character);

  // FIX (pedido do usuário: "quero que tenha mais efeitos"): confete
  // (canvas-confetti já era dependência instalada, mas nunca tinha sido
  // usada em lugar nenhum) disparado uma única vez a cada combate vencido -
  // um jorro maior e mais demorado quando a vitória fecha a disputa (custa 1
  // vida do oponente), e um menor para a 1ª vitória (ainda não decisiva) de
  // uma disputa de 2. Nunca em empate. Respeita `settings.particleEffects`
  // (mesmo toggle que já controla as outras partículas decorativas do jogo -
  // ver RuneParticles.tsx/CombatResult.tsx). O `useEffect` dispara apenas na
  // TRANSIÇÃO de `show` para true (não a cada render enquanto `show` já é
  // true), usando `shownForRef` para não repetir o confete se o componente
  // re-renderizar por outro motivo enquanto o popup ainda está na tela.
  const shownForRef = useRef(false);
  useEffect(() => {
    if (!show || !winner || winner === 'tie' || !settings.particleEffects) {
      if (!show) shownForRef.current = false;
      return;
    }
    if (shownForRef.current) return;
    shownForRef.current = true;

    const winnerTheme = winner === 1 ? p1Theme : p2Theme;
    const isDecisive = disputeWinner === winner;
    confetti({
      particleCount: isDecisive ? 140 : 70,
      spread: isDecisive ? 100 : 65,
      startVelocity: isDecisive ? 55 : 40,
      origin: { y: 0.5 },
      colors: confettiColorsFor(winnerTheme.primary),
      scalar: isDecisive ? 1.1 : 0.85,
      ticks: isDecisive ? 220 : 150,
    });
    if (isDecisive) {
      // Segundo jorro, um instante depois, dos dois lados da tela - só na
      // vitória que realmente decide a disputa, para reforçar o peso do momento.
      window.setTimeout(() => {
        confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.6 }, colors: confettiColorsFor(winnerTheme.primary) });
        confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.6 }, colors: confettiColorsFor(winnerTheme.primary) });
      }, 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, winner, disputeWinner, settings.particleEffects]);

  if (!show || !winner) return null;

  if (winner === 'tie') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="bg-[#1E1A16] rounded-2xl p-10 border-4 border-[#BFB6A6] relative overflow-hidden"
            style={{
              boxShadow: '0 0 60px rgba(191, 182, 166, 0.5)',
            }}
          >
            <div className="relative z-10 flex flex-col items-center gap-4">
              <Swords className="w-16 h-16 text-[#BFB6A6]" />
              <h2 className="font-display text-[56px] text-[#BFB6A6]">
                EMPATE!
              </h2>
              <div className="flex items-center gap-3 text-[24px]">
                <span style={{ color: p1Theme.primary }}>{player1Value}</span>
                <span className="text-[#BFB6A6]">-</span>
                <span style={{ color: p2Theme.primary }}>{player2Value}</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  const winnerTheme = winner === 1 ? p1Theme : p2Theme;
  const winnerName = winner === 1 ? p1Theme.name : p2Theme.name;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
      >
        <motion.div
          initial={{ scale: 0.3, opacity: 0, y: -100 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.3, opacity: 0, y: 100 }}
          transition={{ type: 'spring', duration: 0.6 }}
          className="bg-[#1E1A16] rounded-2xl p-12 border-4 relative overflow-hidden"
          style={{
            borderColor: winnerTheme.primary,
            boxShadow: `0 0 80px ${winnerTheme.primary}80, 0 0 160px ${winnerTheme.primary}40`,
          }}
        >
          {/* Raios de vitória */}
          {settings.particleEffects && (
            <div className="absolute inset-0">
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute top-1/2 left-1/2 w-1 h-full origin-top"
                  style={{
                    backgroundColor: winnerTheme.primary,
                    opacity: 0.1,
                    transform: `rotate(${i * 30}deg)`,
                  }}
                  animate={settings.animations ? { scaleY: [0, 1, 0] } : undefined}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.1,
                  }}
                />
              ))}
            </div>
          )}

          {/* Conteúdo */}
          <div className="relative z-10 flex flex-col items-center gap-6">
            <motion.div
              animate={settings.animations ? {
                scale: [1, 1.2, 1],
                rotate: [0, 10, -10, 0],
              } : undefined}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                repeatDelay: 0.5,
              }}
              className="w-24 h-24 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: winnerTheme.primary,
                boxShadow: `0 0 60px ${winnerTheme.primary}`,
              }}
            >
              <Trophy className="w-12 h-12 text-[#0F1113]" />
            </motion.div>

            <div className="text-center">
              <p className="text-[#BFB6A6] text-[18px] mb-2">Vencedor do Combate</p>
              {/* FIX (pedido do usuário: "ao invés de falar jogador 1 e
                  jogador 2, troque para os respectivos nomes dos
                  personagens") - `winnerName` já é o nome do personagem;
                  a legenda "Jogador N" que ficava logo abaixo repetia a
                  mesma informação, então foi removida em vez de trocada. */}
              <h2
                className="font-display text-[56px] mb-3"
                style={{ color: winnerTheme.primary }}
              >
                {winnerName}
              </h2>
              {player1Value !== undefined && player2Value !== undefined && (
                <div className="flex items-center justify-center gap-3 mt-3">
                  <span
                    className={`${winner === 1 ? 'text-[32px]' : 'text-[20px]'}`}
                    style={{
                      color: p1Theme.primary,
                      fontWeight: winner === 1 ? 'bold' : 'normal'
                    }}
                  >
                    {player1Value}
                  </span>
                  <span className="text-[#BFB6A6]">vs</span>
                  <span
                    className={`${winner === 2 ? 'text-[32px]' : 'text-[20px]'}`}
                    style={{
                      color: p2Theme.primary,
                      fontWeight: winner === 2 ? 'bold' : 'normal'
                    }}
                  >
                    {player2Value}
                  </span>
                </div>
              )}

              {/* FIX (item 11): deixa explícito se esta vitória de combate já
                  fechou a disputa (custando 1 vida do outro jogador) ou se
                  ainda é só a 1ª de 2 necessárias - antes o popup era
                  idêntico nos dois casos, dando a impressão de que vencer
                  "não contava para nada". */}
              {disputeWinner === winner ? (
                <div
                  className="flex items-center justify-center gap-2 mt-4 px-4 py-2 rounded-lg"
                  style={{ backgroundColor: 'rgba(212, 93, 74, 0.15)', border: '1px solid #D45D4A' }}
                >
                  <Heart className="w-5 h-5 text-[#D45D4A] fill-current" />
                  <span className="text-[#D45D4A] font-display text-[16px]">
                    DISPUTA VENCIDA! {winner === 1 ? p2Theme.name : p1Theme.name} perde 1 vida
                  </span>
                </div>
              ) : winnerCombatWins !== undefined ? (
                <p className="text-[#BFB6A6] text-[14px] mt-3">
                  Vitórias na disputa: <span style={{ color: winnerTheme.primary, fontWeight: 'bold' }}>{winnerCombatWins}/2</span> — vença mais 1 combate para o oponente perder 1 vida
                </p>
              ) : null}
            </div>
          </div>

          {/* Faíscas */}
          {settings.particleEffects && [...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute text-[24px] font-display"
              style={{
                color: winnerTheme.primary,
                top: `${20 + (i * 37) % 60}%`,
                left: `${10 + (i * 53) % 80}%`,
              }}
              animate={settings.animations ? {
                y: [0, -20, 0],
                opacity: [0, 1, 0],
                scale: [0, 1, 0],
              } : { opacity: 0.6 }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2,
              }}
            >
              ✦
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
