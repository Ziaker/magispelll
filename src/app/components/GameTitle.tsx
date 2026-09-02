import { characterThemes } from '../lib/characterThemes';

/**
 * GameTitle - o logo "MAGISPE" + um L colorido por personagem jogável.
 *
 * FIX (pedido do usuário: "coloque SEMPRE um L a mais em magispelll para
 * cada personagem novo, com a cor equivalente do mesmo") - os 3 L's do
 * título (Splash.tsx e Home.tsx, cada um com sua própria cópia hardcoded)
 * já nasceram como 1 L por personagem (azul do Mago, vermelho da Besta,
 * dourado do Anjo) - só que hardcoded, então Mosqueteiro/Coringa/Piromante
 * nunca ganharam o L deles. Agora deriva de `characterThemes` (a MESMA
 * fonte de verdade usada por toda a UI de seleção de personagem) em vez de
 * cores fixas - um personagem novo em `characterThemes.ts` ganha o L dele
 * aqui de graça, sem precisar lembrar de editar o título separadamente.
 * Ordem dos L's = ordem de inserção do objeto (mago, besta, anjo,
 * mosqueteiro, coringa, piromante) - a mesma ordem cronológica em que cada
 * personagem foi adicionado ao jogo.
 */
export function GameTitle({ className }: { className?: string }) {
  return (
    <h1 className={className}>
      <span className="text-[#C59E4F]">MAGISPE</span>
      {Object.values(characterThemes).map((theme) => (
        <span key={theme.name} style={{ color: theme.primary }}>
          L
        </span>
      ))}
    </h1>
  );
}
