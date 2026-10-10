// Decoradores y DTO compartidos por productos, almacenes y proveedores.
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

// Conserva el valor original: el texto "false" no debe convertirse en true.
export const RawValue = () =>
  Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key]);

// Elimina espacios de los extremos sin convertir números en texto.
export const TrimText = () =>
  Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const value = obj[key];
    return typeof value === 'string' ? value.trim() : value;
  });

// Elimina espacios y convierte a mayúsculas (códigos de catálogo).
export const TrimUpperCase = () =>
  Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const value = obj[key];
    return typeof value === 'string' ? value.trim().toUpperCase() : value;
  });

export class SetCatalogStatusDto {
  @ApiProperty({ type: Boolean })
  @RawValue()
  @IsBoolean({ message: 'isActive debe ser booleano' })
  isActive: boolean;
}
