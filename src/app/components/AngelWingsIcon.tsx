/**
 * AngelWingsIcon - ícone do Anjo (pedido do usuário: "mude o ícone do anjo
 * para uma aureola com asas"). O lucide-react (biblioteca de ícones já usada
 * em todo o resto do jogo) não tem nenhum ícone de anjo/auréola/asas pronto -
 * este é um SVG customizado, desenhado no mesmo estilo dos ícones lucide
 * (viewBox 24x24, só contorno via `stroke="currentColor"`, sem preenchimento,
 * pontas arredondadas) pra se encaixar sem destoar ao lado dos outros ícones
 * de personagem (Wand2, Skull, etc. - ver CharacterSelection.tsx/
 * PlayerZone.tsx/CharactersList.tsx/CharacterSheet.tsx).
 */
export function AngelWingsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* FIX (revisão: primeira versão lia como máscara/escudo, não como
          "auréola com asas" - as duas asas convergiam pra um mesmo ponto no
          topo, perto demais da auréola, se fundindo visualmente numa forma
          só). Redesenhado com bem mais distância entre as duas partes:
          auréola pequena e isolada no topo; asas nascem de um ponto BAIXO
          no centro (onde ficariam as costas de uma figura) e abrem em
          leque bem largo pros lados, 3 traços cada (uma pena externa mais
          o miolo) - a mesma convenção usada por ícones minimalistas de
          asas (traços graduados, não uma silhueta preenchida). */}
      {/* Auréola - pequena, isolada, bem acima das asas. */}
      <circle cx="12" cy="3.2" r="2" />
      {/* Asa esquerda - 3 traços graduados abrindo em leque a partir de um ponto baixo central. */}
      <path d="M10.5 20c-4-2-7.5-6-8-12" />
      <path d="M10.5 20c-3-2-5.5-5-6-9.5" />
      <path d="M10.5 20c-2-1.5-3.5-3.5-4-6.5" />
      {/* Asa direita (espelhada). */}
      <path d="M13.5 20c4-2 7.5-6 8-12" />
      <path d="M13.5 20c3-2 5.5-5 6-9.5" />
      <path d="M13.5 20c2-1.5 3.5-3.5 4-6.5" />
    </svg>
  );
}
