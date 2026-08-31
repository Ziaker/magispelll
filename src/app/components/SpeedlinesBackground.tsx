import { motion, AnimatePresence } from 'motion/react';
import { getCharacterTheme } from '../lib/characterThemes';
import type { CharacterId } from '../lib/gameEngine';

/**
 * SpeedlinesBackground - pedido do usuário: "adicione um efeito de
 * speedlines no fundo marrom com as cores do personagem que ativou uma
 * magia da vez, faça durar 5 segundos até outro jogador usar outra magia".
 *
 * Linhas de velocidade (o clássico efeito de mangá/anime - traços finos
 * radiando de um ponto central) cobrindo o fundo escuro/marrom do tabuleiro
 * (ver `bg-[#0F1113]` em GameBoard.tsx), na cor do personagem que ativou a
 * magia mais recente. Implementado como `repeating-conic-gradient` (cunhas
 * finas alternando transparente/cor, radiando do centro) em vez de um SVG
 * com dezenas de linhas - é só uma imagem de fundo, sem nenhum `box-shadow`/
 * `filter`/nó de DOM extra por linha, a opção mais barata pra um efeito
 * cobrindo a tela inteira (mesma lição de todo o resto do sistema de
 * efeitos - ver o comentário completo em ArenaMagicBurst.tsx sobre o custo
 * de `box-shadow`/`filter` vs uma propriedade só de pintura como
 * `background`).
 *
 * `character` reflete sempre o ÚLTIMO personagem a ativar uma magia -
 * GameBoard.tsx reinicia o timer de 5s a cada nova ativação (de QUALQUER
 * jogador), então o efeito troca de cor e "renova" o tempo assim que outra
 * magia é usada, em vez de precisar esperar os 5s anteriores acabarem -
 * exatamente o "dura 5 segundos até outro jogador usar outra magia" pedido.
 *
 * FIX (pedido do usuário, Modo Reações: "deixe o aviso para reação muito
 * mais notável e impactante... você não adicionou os efeitos de
 * speedlines") - a versão "ambiente" acima é sutil de propósito (efeito de
 * fundo discreto pra QUALQUER magia comum). `intense` liga uma versão bem
 * mais forte/pulsante especificamente pra janela de reação: opacidade de
 * pico bem maior, linhas mais grossas/rápidas, pulsando em loop contínuo
 * (em vez de um único fade de 5s) por todo o tempo em que a janela estiver
 * aberta, e `z-index` POSITIVO (em vez do -1 "atrás de tudo" da versão
 * ambiente) - a intenção aqui não é mais um fundo discreto, é um alerta que
 * realmente se destaca por cima do tabuleiro.
 */
export function SpeedlinesBackground({
  active,
  character,
  intense = false,
}: {
  active: boolean;
  character: CharacterId | null;
  intense?: boolean;
}) {
  const theme = getCharacterTheme(character ?? 'mago');
  const color = theme.primary;

  return (
    // FIX: `position:fixed`/`absolute` SEMPRE pinta acima de conteúdo normal
    // (não-posicionado) do MESMO contexto de empilhamento, não importa a
    // ordem no DOM - só um z-index NEGATIVO garante ficar atrás de verdade
    // (pinta acima do próprio fundo do container-pai, mas abaixo de tudo o
    // resto). Por isso `z-index: -1` aqui na versão ambiente, e o container
    // raiz em GameBoard.tsx precisa de `relative` (ver lá) pra este elemento
    // negativo ficar contido DENTRO do tabuleiro, em vez de vazar atrás da
    // página inteira. A versão `intense` quebra essa regra de propósito
    // (z-index positivo, ver acima).
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: intense ? 90 : -1 }}>
      <AnimatePresence>
        {active && (
          <motion.div
            key={`${character}-${intense}`}
            className="absolute inset-0"
            style={{
              background: intense
                ? `repeating-conic-gradient(from 0deg, transparent 0deg 2deg, ${color} 2.5deg 3deg)`
                : `repeating-conic-gradient(from 0deg, transparent 0deg 3deg, ${color} 3.5deg 4deg)`,
              mixBlendMode: intense ? 'screen' : 'overlay',
            }}
            initial={{ opacity: 0, rotate: 0, scale: 1.3 }}
            animate={
              intense
                ? { opacity: [0.35, 0.9, 0.35], rotate: 360, scale: 1.3 }
                : { opacity: [0, 0.55, 0.55, 0], rotate: 6, scale: 1.3 }
            }
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={
              intense
                ? { opacity: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }, rotate: { duration: 6, repeat: Infinity, ease: 'linear' } }
                : { duration: 5, times: [0, 0.08, 0.75, 1], ease: 'easeInOut' }
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}
