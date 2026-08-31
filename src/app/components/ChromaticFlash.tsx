import { motion, AnimatePresence } from 'motion/react';

/**
 * ChromaticFlash - flash de distorção cromática na tela inteira (pedido do
 * usuário, item 2: "flash cromático"). Usa `backdrop-filter` (não `filter`,
 * que só afetaria ESTE elemento) aplicado sobre TUDO que está atrás dele por
 * um instante bem curto, como uma falha de sinal de TV no momento de um
 * golpe. Dispara nos MESMOS momentos que o screen shake (ver GameBoard.tsx,
 * reaproveita o mesmo estado `screenShake`) - os dois efeitos combinados
 * vendem o "peso" do impacto.
 *
 * FIX (pedido do usuário: "o efeito visual da magia numeral está dando
 * lag") - `backdrop-filter` é uma das operações CSS mais caras de compositar
 * (o navegador precisa reamostrar TUDO atrás dele a cada frame) - antes
 * empilhava 3 funções de filtro (`hue-rotate`+`saturate`+`contrast`) ao
 * mesmo tempo que a tela já tinha várias outras animações rodando (screen
 * shake, ArenaMagicBurst.tsx, o Diálogo de popup da Magia Numeral). Reduzido
 * para só `hue-rotate` (1 função em vez de 3) - ainda lê como uma falha
 * cromática, mas custa uma fração do processamento.
 */
export function ChromaticFlash({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="chromatic-flash"
          className="fixed inset-0 z-[90] pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.6, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, times: [0, 0.25, 0.55, 1], ease: 'easeOut' }}
          style={{
            backdropFilter: 'hue-rotate(65deg)',
            WebkitBackdropFilter: 'hue-rotate(65deg)',
          }}
        />
      )}
    </AnimatePresence>
  );
}
