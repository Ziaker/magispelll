/**
 * CharacterGlyphIcons.tsx - ícones customizados de Anjo/Besta/Coringa
 * (pedido do usuário: "use esses icones" - referência visual enviada como
 * imagem: halo dourado, rosto de fera com presas, chapéu de bobo da corte,
 * todos em estilo SÓLIDO/preenchido, diferente do resto dos ícones do jogo,
 * que são lucide-react - contorno fino, sem preenchimento). O lucide-react
 * (biblioteca já usada em todo o resto do jogo) não tem nenhum ícone de
 * anjo/halo, fera/monstro ou bobo da corte prontos - e mesmo se tivesse,
 * seriam no estilo de contorno, não no estilo sólido da referência - por
 * isso os três são SVG customizado aqui, com `fill="currentColor"` (sem
 * `stroke`) pra bater com a referência.
 */

/** Halo do Anjo - anel achatado (visto em perspectiva) com 3 raios de brilho acima. */
export function AngelHaloIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      {/* Raios de brilho */}
      <rect x="11.15" y="1.8" width="1.7" height="4" rx="0.85" />
      <rect x="6.6" y="3.9" width="1.7" height="3.6" rx="0.85" transform="rotate(-32 7.45 5.7)" />
      <rect x="15.7" y="3.9" width="1.7" height="3.6" rx="0.85" transform="rotate(32 16.55 5.7)" />
      {/* Anel (halo) achatado - elipse "vazada" via path com regra even-odd */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 9.8c-4.6 0-8.3 1.44-8.3 3.2s3.7 3.2 8.3 3.2 8.3-1.44 8.3-3.2-3.7-3.2-8.3-3.2zm0 5.1c-3.75 0-6.3-1.02-6.3-1.9s2.55-1.9 6.3-1.9 6.3 1.02 6.3 1.9-2.55 1.9-6.3 1.9z"
      />
    </svg>
  );
}

/**
 * Rosto de fera da Besta - sobrancelhas/olhos irritados (barras diagonais
 * em V) + boca aberta com presas.
 *
 * FIX (revisão: a 1ª versão usava 2 formas de "folha" via curva bezier
 * pros olhos, que não renderizavam de um jeito reconhecível - só a boca
 * aparecia, sem nada de irritado ou ameaçador acima dela). Trocado por 2
 * barras retangulares grossas, giradas formando um "V" (a mesma
 * linguagem visual de sobrancelha/olho semicerrado de raiva usada em
 * emoji "😠") - `rect` + `rotate` é previsível de prever sem depender de
 * controle fino de curva bezier à mão.
 */
export function BeastFaceIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      {/* Sobrancelha/olho esquerdo - barra diagonal */}
      <rect x="3" y="6.6" width="8.5" height="2.3" rx="1.15" transform="rotate(16 7.25 7.75)" />
      {/* Sobrancelha/olho direito (espelhado) */}
      <rect x="12.5" y="6.6" width="8.5" height="2.3" rx="1.15" transform="rotate(-16 16.75 7.75)" />
      {/* Boca aberta */}
      <path d="M6 12.8c1.7 3.6 4.2 5.4 6 5.4s4.3-1.8 6-5.4c-2.1 1.5-4.1 2.3-6 2.3s-3.9-.8-6-2.3z" />
      {/* Presa esquerda */}
      <path d="M9.6 14.6l.9 3.4 1.3-2.5z" />
      {/* Presa direita */}
      <path d="M14.4 14.6l-.9 3.4-1.3-2.5z" />
    </svg>
  );
}

/**
 * Chapéu de bobo da corte do Coringa - 3 pontas com guizo na ponta + faixa.
 *
 * FIX (revisão: a 1ª versão tinha as 3 pontas quase retas, lendo mais como
 * coroa de rei do que chapéu de bobo). As pontas laterais agora caem/curvam
 * bem mais pra fora antes de subir até o guizo (o "floppy" característico
 * de um chapéu de bobo de verdade, bem diferente de uma ponta rígida de
 * coroa).
 */
export function JesterHatIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      {/* Ponta esquerda (caída/curva) + guizo */}
      <path d="M9.6 15.6C6.6 14 4.1 10.9 4.5 6.6c2.7 1.7 4.7 5.3 5.1 9z" />
      <circle cx="4.1" cy="5.9" r="1.35" />
      {/* Ponta central (reta) + guizo */}
      <path d="M12.9 15.6c-.6-3.3-.6-7 0-10.4-.6 3.4-.6 7.1 0 10.4z" />
      <circle cx="12.2" cy="3.5" r="1.35" />
      {/* Ponta direita (espelhada) + guizo */}
      <path d="M14.4 15.6c3-1.6 5.5-4.7 5.1-9-2.7 1.7-4.7 5.3-5.1 9z" />
      <circle cx="19.9" cy="5.9" r="1.35" />
      {/* Faixa/aba */}
      <rect x="4" y="15.6" width="16" height="2.4" rx="1.2" />
    </svg>
  );
}
