import { motion, AnimatePresence } from 'motion/react';

/**
 * CardRejectFlash - efeito visual do item 3 da 6ª rodada de correções:
 * "Caso o jogador tente colocar uma carta de numero no campo do monstro,
 * faça a carta tremer e piscar em vermelho (a carta) e traga ela de volta
 * para a mão". A carta de número JAMAIS sai da mão de verdade (o reducer -
 * `handlePlaceMonsterCard` em gameEngine.ts - já rejeita silenciosamente
 * qualquer tentativa de posicionar uma carta que não seja Monstro, então não
 * havia bug de estado, só falta de feedback visual da rejeição), então
 * "trazer de volta pra mão" aqui significa: nunca a tira visualmente do
 * lugar, e ainda assim deixa claro que a tentativa foi rejeitada.
 *
 * Deliberadamente um componente separado de MagicEffectBurst.tsx: aquele
 * comunica "algo mágico/positivo aconteceu" (anéis dourados expandindo +
 * brilho). Este precisa comunicar o oposto - um ERRO/rejeição - por isso usa
 * vermelho (mesma cor `#D45D4A` já usada em PlayerZone.tsx para o anel de
 * "selecionada para descarte") e um flash piscando (opacidade sobe e desce
 * duas vezes) em vez de um anel que expande e some.
 *
 * O tremor (transform: translateX) é aplicado separadamente pelo componente
 * pai, via `animation: 'shake ...'` inline no próprio wrapper da carta -
 * reaproveitando o keyframe `shake` que já existia em globals.css (hoje
 * usado no botão de Magia Numeral pronta) - para tremer a carta inteira, não
 * só esta camada de overlay.
 */
export function CardRejectFlash({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="card-reject-flash"
          className="absolute inset-0 z-40 pointer-events-none rounded-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0, 1, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, times: [0, 0.2, 0.45, 0.7, 1] }}
          style={{
            backgroundColor: 'rgba(212, 93, 74, 0.45)',
            boxShadow: '0 0 0 3px #D45D4A, 0 0 18px 6px rgba(212, 93, 74, 0.55)',
          }}
        />
      )}
    </AnimatePresence>
  );
}
