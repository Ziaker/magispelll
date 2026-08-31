import type { CharacterId } from '../lib/gameEngine';

/**
 * FIX (pedido do usuário: "quando eu disse querer que os números aparecessem
 * no meio, eu quis dizer do lado das duas espadas, um na esquerda e um na
 * direita, não no literal meio da tela") - o componente `CombatValueReveal`
 * que vivia aqui (um overlay `fixed inset-0` centralizado no VIEWPORT
 * inteiro) foi removido - a renderização dos 2 valores agora vive direto em
 * BattleField.tsx, ladeando o ícone de espadas (⚔) do divisor central entre
 * os dois campos, que é o "meio" que o usuário sempre quis dizer. Este
 * arquivo sobra só com o tipo do spec, que GameBoard.tsx (dono do estado
 * `combatValueReveal`) e BattleField.tsx (quem agora desenha os números)
 * ainda compartilham.
 */
export interface CombatValueRevealSpec {
  p1Value: number;
  p2Value: number;
  p1Character: CharacterId;
  p2Character: CharacterId;
  winner: 1 | 2 | 'tie';
}
