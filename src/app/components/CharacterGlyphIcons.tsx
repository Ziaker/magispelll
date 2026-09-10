import type { CSSProperties } from 'react';
import angelHaloSrc from '../../assets/icons/angel-halo.png';
import beastFaceSrc from '../../assets/icons/beast-face.png';
import jesterHatSrc from '../../assets/icons/jester-hat.png';

/**
 * CharacterGlyphIcons.tsx - ícones de Anjo/Besta/Coringa (pedido do
 * usuário: "eu te dei os ícones pra você recortar" - a versão anterior
 * desta função tinha DESENHADO os 3 do zero tentando imitar a imagem de
 * referência que o usuário mandou; ele queria os PIXELS reais da imagem
 * recortados, não uma releitura). As 3 imagens (`src/assets/icons/*.png`)
 * vieram de um recorte automático (Python/Pillow) em cima do PNG original
 * (`ChatGPT Image 31 de ago. de 2026, 10_37_31.png`, na raiz do projeto) -
 * cada círculo de fundo marrom foi removido (máscara por distância de cor:
 * qualquer pixel próximo do castanho-escuro do círculo, ou já transparente,
 * vira 100% transparente; só o glifo dourado sobra), e a imagem foi cortada
 * bem rente ao glifo resultante.
 *
 * Por serem PNG (cor fixa, dourado), diferente dos ícones lucide-react
 * usados no resto do jogo (`currentColor`, se adaptam à cor de texto do
 * elemento pai), estes 3 sempre aparecem dourados, não importa o `style`/
 * `color` do lugar onde são usados (CharacterSelection.tsx/PlayerZone.tsx/
 * CharactersList.tsx/CharacterSheet.tsx - alguns desses lugares antes
 * pintavam o ícone com a cor do próprio personagem ou com uma cor escura de
 * contraste; esse comportamento para de fazer efeito nestes 3 ícones
 * especificamente, e não há como preservá-lo sem reintroduzir um desenho à
 * mão em vez da imagem de verdade).
 *
 * `style` (opcional) SEMPRE passa por cima do `style` que o próprio
 * componente já aplicaria - só usado hoje por CharacterMagicBurst.tsx/
 * ArenaMagicBurst.tsx (Besta) pra aplicar um `filter: drop-shadow(...)` na
 * cor do tema, criando um BRILHO ao redor do rosto dourado fixo - não pinta
 * o ícone em si (impossível, ver comentário acima), só a sombra projetada
 * por fora dele, que qualquer cor de `filter` consegue mesmo num PNG.
 */
export function AngelHaloIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return <img src={angelHaloSrc} className={className} style={style} alt="" />;
}

export function BeastFaceIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return <img src={beastFaceSrc} className={className} style={style} alt="" />;
}

export function JesterHatIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return <img src={jesterHatSrc} className={className} style={style} alt="" />;
}
