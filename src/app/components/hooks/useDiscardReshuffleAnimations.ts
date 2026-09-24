import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { getAnimationDurationScale, type Settings } from '../../lib/settings';
import type { GameState } from '../../lib/gameStateTypes';
import type { FlyingDiscardSpec } from '../FlyingDiscardCard';
import type { DeckReshuffleBurstSpec } from '../DeckReshuffleBurst';

export interface UseDiscardReshuffleAnimationsParams {
  gameState: GameState;
  settings: Settings;
  /** Mapa compartilhado (GameBoard.tsx) de `card.id` -> última posição real na tela - mesmo mecanismo que BeastBurnFlash.tsx/ReactionNegatedBurst.tsx já usam, não duplicado aqui. */
  cardPositionsRef: MutableRefObject<Map<string, DOMRect>>;
  /** Ref do painel "Pilha de Descarte" (JSX de GameBoard.tsx) - origem do reembaralhamento e destino do voo de descarte. */
  discardPileRef: MutableRefObject<HTMLDivElement | null>;
  /** Ref do painel "Baralho" (JSX de GameBoard.tsx) - destino do reembaralhamento. */
  deckPileRef: MutableRefObject<HTMLDivElement | null>;
}

export interface UseDiscardReshuffleAnimationsResult {
  flyingDiscards: FlyingDiscardSpec[];
  deckReshuffleBurst: DeckReshuffleBurstSpec | null;
}

/**
 * useDiscardReshuffleAnimations - Fase 1 do roadmap de overhaul de animações
 * ("Descarte + Reembaralhamento"): primeira integração visual real do
 * contrato de evento estruturado da Fase 0 (`LogEntry.trigger`/`chainId`/
 * `sequence`/`animationPolicy`, ver gameLogTypes.ts) com a UI.
 *
 * ANTES (2 efeitos desacoplados em GameBoard.tsx): um observava
 * `gameState.discardPile` crescendo (diff de Set de ids) sem nunca olhar o
 * log, e outro observava `gameState.log` só para o `trigger ===
 * 'deck-reshuffled'` isolado - nenhum dos dois sabia da existência do outro,
 * então um descarte que causa reshuffle (pushToDiscard, deckLifecycle.ts)
 * disparava as duas animações no MESMO instante, concorrentes, sem relação
 * causal nenhuma entre si.
 *
 * AGORA: um único efeito, disparado por MUDANÇA NO LOG (não mais no
 * `discardPile` isolado) - a decisão de SE/COMO animar (suprimido via
 * `animationPolicy`, correlação com reshuffle via `trigger`, agrupamento via
 * `chainId`) vem dos campos estruturados da entrada nova, nunca de texto.
 *
 * Ressalva deliberada (documentada, não um resquício do padrão antigo): não
 * existe hoje nenhum `trigger`/`type` dedicado por CARTA descartada no log -
 * dos 46 call sites de `pushToDiscard` no motor, só 1 (descarte manual da
 * fase de Compra) usa `type: 'discard'`; os outros 45 (combate, Fúria
 * Sanguinária da Besta, Bola de Fogo do Piromante, busca de Ás do Anjo J,
 * armadilhas do Coringa...) registram sua PRÓPRIA mensagem sem nenhum sinal
 * uniforme de "carta X foi descartada" - instrumentar isso exigiria tocar
 * ~45 arquivos de handler só para plumbing de log, fora do escopo desta
 * fase. `gameState.discardPile` continua sendo a fonte de quais CARTAS
 * FÍSICAS saíram (comparação de ids, não inferência de comportamento - o
 * motor já é a fonte de verdade disso, pedido explícito do usuário), mas o
 * que decide SE isso deve animar, EM QUE ORDEM e COM QUE POLÍTICA agora vem
 * do log. Efeito também escuta `gameState.discardPile` diretamente (além de
 * `gameState.log`) como rede de segurança - nenhum dos 46 call sites hoje
 * pusha pro descarte sem logar nada no mesmo dispatch, mas se algum dia um
 * surgir, a animação não se perde silenciosamente.
 *
 * Ordem causal (pedido explícito do usuário): quando o MESMO lote de
 * entradas novas contém cartas recém-descartadas E um `deck-reshuffled`,
 * `DeckReshuffleBurst` só dispara depois que o voo do(s) `FlyingDiscardCard`
 * termina (descarte(s) -> chegada ao cemitério -> reshuffle -> cartas
 * indo ao deck) - nunca simultâneo/contraditório.
 */
export function useDiscardReshuffleAnimations({
  gameState,
  settings,
  cardPositionsRef,
  discardPileRef,
  deckPileRef,
}: UseDiscardReshuffleAnimationsParams): UseDiscardReshuffleAnimationsResult {
  const [flyingDiscards, setFlyingDiscards] = useState<FlyingDiscardSpec[]>([]);
  const [deckReshuffleBurst, setDeckReshuffleBurst] = useState<DeckReshuffleBurstSpec | null>(null);
  const lastSeenLogIdRef = useRef(gameState.log.length > 0 ? gameState.log[gameState.log.length - 1].id : -1);
  const prevDiscardIdsRef = useRef(new Set(gameState.discardPile.map((c) => c.id)));

  useEffect(() => {
    const lastSeenId = lastSeenLogIdRef.current;
    const newEntries = gameState.log.filter((e) => e.id > lastSeenId);
    lastSeenLogIdRef.current = gameState.log.length > 0 ? gameState.log[gameState.log.length - 1].id : lastSeenId;

    const prevIds = prevDiscardIdsRef.current;
    const newlyDiscarded = gameState.discardPile.filter((c) => !prevIds.has(c.id));
    prevDiscardIdsRef.current = new Set(gameState.discardPile.map((c) => c.id));

    const reshuffleEntry = newEntries.find((e) => e.trigger === 'deck-reshuffled');
    if (!settings.animations || (newlyDiscarded.length === 0 && !reshuffleEntry)) return;

    // settings.animations já é true aqui, então getAnimationDurationScale nunca devolve o 0 "instantâneo de propósito" (ver comentário de `delay()` em GameBoard.tsx sobre esse bug já corrigido antes).
    const scale = getAnimationDurationScale(settings);
    // Espaço de chave estável (imune ao teto de 30 entradas do log, que trava `gameState.log.length` - ver comentário de `lastSeenLogIdRef` em GameBoard.tsx): chainId da própria entrada de reshuffle quando existe, senão o id da última entrada nova, senão o último id já visto.
    const batchId = reshuffleEntry?.chainId ?? newEntries[newEntries.length - 1]?.id ?? lastSeenId;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let flightMaxMs = 0;
    // FIX (achado na verificação ao vivo da Fase 1): se ESTE efeito for
    // desmontado/re-executado (novo dispatch chegando) ANTES do próprio
    // setTimeout de limpeza normal disparar - ex.: dois descartes em
    // sequência rápida - o cleanup abaixo cancela o timeout, mas sem isto os
    // specs deste lote ficariam ÓRFÃOS em flyingDiscards/deckReshuffleBurst
    // para sempre (nada mais filtra por essas chaves específicas depois).
    // Rastreados aqui para o cleanup remover pelas MESMAS chaves na hora,
    // como um "unmount" antecipado da animação em vez de cortá-la sem limpar
    // o estado que ela própria adicionou.
    let addedFlyingKeys: string[] = [];
    let addedBurstKey: string | null = null;

    if (newlyDiscarded.length > 0) {
      // Único call site hoje com `type: 'discard'` estruturado (descarte manual, drawPhaseHandlers.ts) - os outros 45 não têm entrada dedicada pra suprimir individualmente ainda (ver comentário do arquivo), então este check é real só para esse caminho e inofensivo (sempre falso) para os demais.
      const discardSuppressed = newEntries.some((e) => e.type === 'discard' && e.animationPolicy === 'suppress');
      const toRect = discardPileRef.current?.getBoundingClientRect();
      if (!discardSuppressed && toRect) {
        const specs: FlyingDiscardSpec[] = [];
        let staggerIndex = 0;
        for (const card of newlyDiscarded) {
          const fromRect = cardPositionsRef.current.get(card.id);
          if (!fromRect) continue; // carta nunca ficou visível nesta sessão (ex.: reembaralhada direto do descarte) - nada para animar
          specs.push({
            key: `${card.id}-${batchId}`,
            card,
            from: { left: fromRect.left, top: fromRect.top, width: fromRect.width, height: fromRect.height },
            to: { left: toRect.left, top: toRect.top, width: toRect.width, height: toRect.height },
            scale,
            staggerIndex: staggerIndex++,
          });
        }
        if (specs.length > 0) {
          setFlyingDiscards((prev) => [...prev, ...specs]);
          addedFlyingKeys = specs.map((spec) => spec.key);
          // Duração real por carta: FlyingDiscardCard.tsx usa 0.4s * scale, escalonada por staggerIndex * 0.05s * scale (ver lá) - a última carta do lote termina em (N-1)*50+400 ms * scale.
          flightMaxMs = ((specs.length - 1) * 50 + 400) * scale;
          const cleanupMs = Math.max(150, Math.round(flightMaxMs + 80));
          timeouts.push(
            setTimeout(() => {
              setFlyingDiscards((prev) => prev.filter((s) => !specs.some((spec) => spec.key === s.key)));
            }, cleanupMs)
          );
        }
      }
    }

    if (reshuffleEntry && reshuffleEntry.animationPolicy !== 'suppress') {
      const fromRect = discardPileRef.current?.getBoundingClientRect();
      const toRect = deckPileRef.current?.getBoundingClientRect();
      if (fromRect && toRect) {
        const burstKey = `reshuffle-${reshuffleEntry.id}`;
        const fire = () => {
          setDeckReshuffleBurst({
            key: burstKey,
            from: { left: fromRect.left, top: fromRect.top, width: fromRect.width, height: fromRect.height },
            to: { left: toRect.left, top: toRect.top, width: toRect.width, height: toRect.height },
            scale,
          });
          addedBurstKey = burstKey;
          // Última ShuffleCard (DeckReshuffleBurst.tsx) termina em ~950ms * scale (6*45+30 de delay + 650 de duração) - cleanup anterior (750ms fixo) cortava ela ~200ms antes do fim visual real.
          const burstMs = Math.max(150, Math.round(950 * scale + 100));
          timeouts.push(
            setTimeout(() => {
              setDeckReshuffleBurst((prev) => (prev?.key === burstKey ? null : prev));
            }, burstMs)
          );
        };
        if (flightMaxMs > 0) {
          timeouts.push(setTimeout(fire, Math.round(flightMaxMs)));
        } else {
          fire();
        }
      }
    }

    return () => {
      timeouts.forEach(clearTimeout);
      if (addedFlyingKeys.length > 0) {
        setFlyingDiscards((prev) => prev.filter((s) => !addedFlyingKeys.includes(s.key)));
      }
      if (addedBurstKey) {
        const key = addedBurstKey;
        setDeckReshuffleBurst((prev) => (prev?.key === key ? null : prev));
      }
    };
  }, [gameState.log, gameState.discardPile, settings, cardPositionsRef, discardPileRef, deckPileRef]);

  return { flyingDiscards, deckReshuffleBurst };
}
