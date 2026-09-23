/**
 * characterRegistry.ts - fonte canônica da identidade dos personagens.
 *
 * Este módulo é deliberadamente pequeno e sem dependências do motor. Tipos,
 * roster e validação de entradas externas vivem aqui para que UI, IA, scripts
 * e o próprio gameEngine possam depender da mesma definição sem criar ciclos.
 */
export const ALL_CHARACTER_IDS = [
  'mago',
  'besta',
  'anjo',
  'mosqueteiro',
  'coringa',
  'piromante',
  'druida',
  'glacial',
] as const;

export type CharacterId = (typeof ALL_CHARACTER_IDS)[number];

/** Metadados mínimos derivados da lista canônica. */
export const CHARACTER_DEFINITIONS = ALL_CHARACTER_IDS.map((id) => ({ id })) as readonly {
  readonly id: CharacterId;
}[];

/** Validação segura para CLI, localStorage e outras entradas string. */
export function isCharacterId(value: string): value is CharacterId {
  return (ALL_CHARACTER_IDS as readonly string[]).includes(value);
}
