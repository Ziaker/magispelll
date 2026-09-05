"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "./utils";

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

/**
 * FIX (item 9 do Grupo B da lista de afazeres, "tooltips sem fallback de
 * toque pra mobile"): o Radix só abre um Tooltip no hover - sem estado de
 * hover no toque, TODA explicação de magia/efeito do jogo (selos J/Q/K,
 * Zona Monstro, cartas na mão etc. - todos usam este mesmo componente
 * compartilhado) ficava simplesmente inacessível num celular, apesar do
 * jogo já suportar toque (TouchBackend do react-dnd). Este contexto deixa o
 * `Tooltip` controlado (`open`/`onOpenChange` próprios) e o `TooltipTrigger`
 * alterna esse estado no toque/clique, virando "toque pra abrir, toque de
 * novo (ou em outro lugar) pra fechar" - continua abrindo no hover normal
 * em desktop, já que o Root controlado ainda recebe as mudanças de estado
 * que o próprio Radix dispara via `onOpenChange` a cada hover.
 */
const TooltipOpenContext = React.createContext<{ open: boolean; setOpen: (open: boolean) => void } | null>(null);

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const [open, setOpen] = React.useState(false);
  return (
    <TooltipProvider>
      <TooltipOpenContext.Provider value={{ open, setOpen }}>
        <TooltipPrimitive.Root data-slot="tooltip" open={open} onOpenChange={setOpen} {...props} />
      </TooltipOpenContext.Provider>
    </TooltipProvider>
  );
}

function TooltipTrigger({
  onClick,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const ctx = React.useContext(TooltipOpenContext);
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      onClick={(event) => {
        onClick?.(event);
        ctx?.setOpen(!ctx.open);
      }}
      {...props}
    />
  );
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  // FIX (bug reaberto - "todos os tooltips do jogo estão mal posicionados e
  // desorganizados"): a versão anterior forçava este Portal a nascer DENTRO
  // do wrapper de GameBoard.tsx (`zoom: 0.85`) via `useZoomContainer()`, pra
  // o tooltip herdar o zoom visualmente (senão nascia grande demais perto de
  // uma carta pequena). Só que isso quebra o cálculo de posição do
  // Radix/Floating UI (baseado em `getBoundingClientRect()`, que JÁ reporta
  // a posição correta considerando qualquer zoom nos ancestrais) - com o
  // tooltip portalizado DENTRO de mais uma camada de zoom, o Floating UI
  // aplica a distância calculada NUMA escala e o navegador desenha o
  // resultado NOUTRA, e o tooltip nasce dezenas/centenas de px longe do
  // ícone/carta que o abriu (confirmado medindo a posição real do trigger
  // vs. a posição real do tooltip renderizado - nunca bateram). Revertido
  // pro Portal padrão do Radix (`document.body`, fora da árvore zoomada) -
  // o tooltip nasce em tamanho real (não encolhido como o resto do
  // tabuleiro), mas corretamente posicionado, o que importa muito mais.
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        // FIX (pedido do usuário: "corrija o tooltip de visão completa do
        // coringa - o texto fica fora do retângulo") - achado medindo ao
        // vivo: o tooltip da Carta Coringa (Monstro), o mais longo dos 5 da
        // sidebar "Magias de CORINGA" E o mais à direita (último badge da
        // fileira), media a apenas ~10px da borda direita real da tela -
        // sem NENHUM `collisionPadding` (o padrão do Radix é 0px), o
        // desvio de colisão só evita cruzar a borda EXATA, sem folga
        // nenhuma, então em janelas mais estreitas (ou a uma escala de
        // DPI diferente da testada aqui) ele realmente vaza pra fora.
        // 12px de folga em todos os lados resolve pra este e qualquer
        // outro tooltip do jogo perto de uma borda.
        collisionPadding={12}
        className={cn(
          "bg-primary text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="bg-primary fill-primary z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
