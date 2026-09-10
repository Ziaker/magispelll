import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { getCombatModifierStatuses } from '../lib/statusEffects';
import type { Card } from '../lib/cardUtils';

/**
 * CombatModifierBadge.tsx - QoL (pedido do usuário: "indicador visual de
 * modificador de combate (+N/-N) nas cartas") - Simbiose/Urtiga do Druida,
 * Crioescudo do Glacial, Tiro Certeiro do Mosqueteiro e o escudo do Valete
 * do Coringa todos aplicam um StatusEffect `kind: 'combatModifier'`
 * (statusEffects.ts) numa carta, mas nada na UI mostrava isso até agora -
 * o jogador só descobria que uma carta valia mais/menos do que a face
 * mostra depois que o combate já tinha resolvido.
 *
 * Fica no TOPO CENTRAL da carta (dentro dela - o wrapper de PlayingCard.tsx
 * usa `overflow-hidden`, então qualquer coisa fora dos limites da carta
 * simplesmente não apareceria), não num dos 4 cantos que CardKeywords.tsx já
 * ocupa (Revelada/Ás Transformado/Fusão/Proteção Divina/Trancada/Congelada/
 * Spotlight já cobrem os 4 cantos sozinhos) - um número de 2+ dígitos com
 * sinal não cabe num selo pequeno de canto de qualquer forma, e o centro do
 * topo fica livre entre os dois cantos superiores.
 *
 * Não tenta calcular o valor final de combate (precisaria do Spotlight e do
 * valor-base da carta, que variam por contexto) - só soma/lista os
 * modificadores 'add' e lista os 'multiply' separados, sempre corretos
 * porque vêm direto do mesmo StatusEffect que handleResolveCombat usa de
 * verdade (getCombatModifierStatuses, statusEffects.ts).
 */
export function CombatModifierBadge({ card }: { card?: Card }) {
  const modifiers = getCombatModifierStatuses(card);
  if (modifiers.length === 0) return null;

  const addTotal = modifiers.filter((m) => m.mode !== 'multiply').reduce((sum, m) => sum + (m.magnitude ?? 0), 0);
  const multiplyMods = modifiers.filter((m) => m.mode === 'multiply');

  const parts: string[] = [];
  if (addTotal !== 0) parts.push(`${addTotal > 0 ? '+' : ''}${addTotal}`);
  multiplyMods.forEach((m) => parts.push(`×${m.magnitude ?? 1}`));
  const display = parts.join(' ');
  if (!display) return null;

  // Verde quando o efeito líquido favorece esta carta, vermelho quando
  // prejudica - `multiply` só existe hoje como reforço (Fúria Selvagem da
  // Besta, sempre >1), então conta como positivo.
  const isPositive = addTotal > 0 || multiplyMods.some((m) => (m.magnitude ?? 1) > 1);
  const isNegative = addTotal < 0;
  const color = isNegative ? '#D45D4A' : isPositive ? '#6CC47A' : '#BFB6A6';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="absolute top-1 left-1/2 -translate-x-1/2 z-20 px-1.5 py-0.5 rounded-full border cursor-help whitespace-nowrap"
            style={{ backgroundColor: '#1E1A16', borderColor: color, boxShadow: `0 0 6px ${color}80` }}
          >
            <span className="text-[10px] font-bold" style={{ color }}>
              {display}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-[#1E1A16] max-w-[200px]" style={{ borderColor: color }}>
          <div className="space-y-0.5">
            {modifiers.map((m, i) => (
              <p key={i} className="text-[11px] text-[#EFE7D6]">
                <span className="font-semibold">{m.label}:</span> {m.mode === 'multiply' ? `×${m.magnitude ?? 1}` : `${(m.magnitude ?? 0) > 0 ? '+' : ''}${m.magnitude ?? 0}`}
              </p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
