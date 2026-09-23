from pathlib import Path

path = Path('src/app/lib/aiPlayer.ts')
source = path.read_text()

anchor = "function shouldLaunchFireball(state: GameState, ai: PlayerNumber): boolean {\n  const me = state[playerKeyOf(ai)];"
replacement = "function shouldLaunchFireball(state: GameState, ai: PlayerNumber): boolean {\n  // O segundo efeito das magias do Piromante (lançar a Bola de Fogo) é\n  // estritamente de COMBATE no motor. Este guard mantém a heurística da IA\n  // alinhada com a mesma autoridade e impede J/Q da fase de Compra de\n  // produzirem EXECUTE_MAGIC que o reducer necessariamente rejeita.\n  if (state.phase !== 'combat') return false;\n  const me = state[playerKeyOf(ai)];"
if source.count(anchor) != 1:
    raise SystemExit('shouldLaunchFireball anchor not found exactly once')
source = source.replace(anchor, replacement)

path.write_text(source)
