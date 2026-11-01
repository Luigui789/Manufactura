// Selecciona los campos modificados de nuestros formularios planos.
export function onlyDirty<T extends Record<string, unknown>>(
  data: T,
  dirtyFields: Partial<Record<keyof T, unknown>>,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => dirtyFields[key as keyof T] === true),
  ) as Partial<T>;
}
