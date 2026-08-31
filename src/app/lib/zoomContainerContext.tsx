import { createContext, useContext } from 'react';

/**
 * FIX (checagem extensa por bugs - "vários efeitos e outras coisas são mal
 * posicionados" sob o zoom de GameBoard.tsx; mesma causa raiz já corrigida
 * no <Toaster/> antes deste): qualquer componente Radix que usa Portal
 * (Tooltip, Dialog, Select, etc.) por padrão renderiza direto em
 * `document.body`, IGNORANDO o `zoom: 0.85` aplicado só à árvore de dentro
 * do wrapper de GameBoard.tsx - o conteúdo portalizado nasce em tamanho
 * real (100%), destoando visivelmente do resto do tabuleiro encolhido (ex.:
 * um tooltip de carta aparecendo grande demais perto de uma carta pequena).
 *
 * Este contexto guarda uma referência à própria div zoomada de
 * GameBoard.tsx; um componente portalizado DENTRO dela consome via
 * `useZoomContainer()` e passa o resultado como `container` do seu próprio
 * `<Xyz.Portal container={...}>`, fazendo o conteúdo nascer DENTRO da
 * árvore zoomada (herdando o `zoom` corretamente) em vez de escapar pro
 * body. Fora do GameBoard (telas de configuração/seleção de personagem, que
 * não têm zoom nenhum), o contexto vale `null` e o Portal cai de volta no
 * padrão (`document.body`), que já é o comportamento correto lá.
 */
export const ZoomContainerContext = createContext<HTMLElement | null>(null);

export function useZoomContainer() {
  return useContext(ZoomContainerContext);
}
