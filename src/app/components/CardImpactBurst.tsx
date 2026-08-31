import { AnimatePresence, motion } from 'motion/react';

/**
 * CardImpactBurst - pedido do usuário: "adicione efeitos de impacto quando a
 * carta é posicionada. Embaixo dela"; revisado depois: "o efeito de carta
 * sendo posicionada é mal perceptível, deixe maior e faça com que o efeito
 * surja do campo, não do slot"; revisado de novo: "remova o efeito para
 * cartas horizontais, faça ser um efeito quadrado que se expande e depois
 * some" - simplificado para exatamente isso: um quadrado que nasce do
 * tamanho da própria carta, centralizado no ponto de impacto, expande e
 * desaparece. Sem anéis, sem poeira, sem clarão radial - só o quadrado.
 * Usado só na carta PRINCIPAL de um slot (nunca em cartas horizontais - ver
 * FieldSlotView.tsx, que só renderiza isto para `slot.faceDownCard`).
 *
 * FIX (pedido do usuário: "faça o efeito de colocar carta no campo ser no
 * CAMPO, não abaixo dele - está ocorrendo abaixo dele") - a âncora era
 * `bottom-0` (borda inferior do próprio elemento da carta), com o quadrado
 * centralizado NESSE ponto - metade do quadrado ficava sobre a carta, a
 * outra metade transbordava pra baixo dela, pro espaço onde fica o texto
 * "Slot N", lendo como "abaixo do campo". Agora a âncora é o CENTRO do
 * elemento (`top-1/2 left-1/2`) - o quadrado nasce e se expande a partir do
 * meio da própria carta, sempre sobre o campo.
 */
export function CardImpactBurst({ active }: { active: boolean }) {
  const size = 90;

  return (
    <div className="absolute left-1/2 top-1/2 pointer-events-none" style={{ transform: 'translate(-50%, -50%)' }}>
      <AnimatePresence>
        {active && (
          <motion.div
            key="impact"
            className="absolute rounded-md"
            style={{
              left: 0,
              top: 0,
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              border: '3px solid #C59E4F',
              boxShadow: '0 0 18px rgba(197, 158, 79, 0.7)',
            }}
            initial={{ scale: 0.3, opacity: 0.9, rotate: 0 }}
            animate={{ scale: 2.2, opacity: 0, rotate: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
