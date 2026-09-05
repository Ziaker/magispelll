/**
 * PreGameSteps.tsx - indicador "Etapa X de 3" compartilhado pelas 3 telas do
 * fluxo normal de pré-jogo (GameConfig -> CharacterSelection -> GameSummary).
 *
 * FIX (item 28 do Grupo G da lista de afazeres, "indicador de progresso 1/2/3
 * fixo no topo do fluxo Config -> Seleção de Personagem -> Resumo"): as 3
 * telas já existiam com "Editar" de volta pra Config (GameSummary.tsx), só
 * faltava deixar claro, ENQUANTO o jogador está nas duas primeiras, quantas
 * etapas ainda faltam. Só aparece no fluxo COMPLETO - o atalho de "Partida
 * Rápida" pula Config e Resumo de propósito (ver handleQuickStart em
 * App.tsx), então mostrar "Etapa 2 de 3" ali seria enganoso (não existe
 * etapa 1 nem 3 nesse atalho) - App.tsx só passa `step` quando o fluxo é o
 * normal completo.
 */
export function PreGameSteps({ current }: { current: 1 | 2 | 3 }) {
  const labels = ['Configuração', 'Personagens', 'Resumo'];
  return (
    <div className="flex items-center gap-2 mb-6">
      {labels.map((label, i) => {
        const step = (i + 1) as 1 | 2 | 3;
        const active = step === current;
        const done = step < current;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${
                active
                  ? 'bg-[#C59E4F] text-[#0F1113]'
                  : done
                    ? 'bg-[#6CC47A]/30 text-[#6CC47A] border border-[#6CC47A]/50'
                    : 'bg-[#0F1113] text-[#BFB6A6] border border-[#C59E4F]/30'
              }`}
            >
              {step}
            </div>
            <span className={`text-[11px] ${active ? 'text-[#C59E4F] font-semibold' : 'text-[#BFB6A6]'}`}>{label}</span>
            {step < 3 && <div className="w-6 h-px bg-[#C59E4F]/20" />}
          </div>
        );
      })}
    </div>
  );
}
