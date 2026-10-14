import { ConflictException, NotFoundException } from '@nestjs/common';

/**
 * Códigos de error de negocio esperados para el modulo de compras
 */
export const PurchaseOrderErrorCodes = {
    NOT_EDITABLE: 'PURCHASE_ORDER_NOT_EDITABLE',
    NOT_RECEIVABLE: 'PURCHASE_ORDER_NOT_RECEIVABLE',
    RECEIPT_EXCEEDS_PENDING: 'RECEIPT_EXCEEDS_PENDING',
    INACTIVE_CATALOG: 'INACTIVE_CATALOG',
    REFERENCE_NOT_FOUND: 'REFERENCE_NOT_FOUND',
} as const;

/**
 * Clases y fábricas de excepciones para mantener consistencia en los throw del servicio.
 * Retornan el formato { message, code } que el frontend intercepta en apiFetch
 */
export class PurchaseOrderErrors {

    //409: Modificación en estado no permitido (ej: editar cuando no es DRAFT)
    static notEditable() {
        return new ConflictException({
            message: 'La orden de compra no puede ser editada en su estado actual. Solo las ordenes en estado DRAFT son modificables.',
            code: PurchaseOrderErrorCodes.NOT_EDITABLE,
        });
    }

    //409: Intentar recibir una orden CANCELLED, RECEIVED o DRAFT
    static notReceivable() {
        return new ConflictException({
            message: 'La orden de compra no puede recibir ingresos en su estado actual.',
            code: PurchaseOrderErrorCodes.NOT_RECEIVABLE,
        });
    }

    //409: La recepción total supera lo ordenado original
    static receiptExceedsPending() {
        return new ConflictException({
            message: 'La cantidad a recibir excede la cantidad pendiente en al menos una línea de la orden',
            code: PurchaseOrderErrorCodes.RECEIPT_EXCEEDS_PENDING,
        });
    }

    //409: El proveedor o algún producto está desactivado al crear o confirmar
    static inactiveCatalog(detail: string) {
        return new ConflictException({
            message: `Catálogo inactivo: ${detail}`,
            code: PurchaseOrderErrorCodes.INACTIVE_CATALOG,
        });
    }

    //404: No existe la orden, proveedor, producto o almacén
    static referenceNotFound(entity: string) {
        return new NotFoundException({
            message: `Referencia no encontrada o no válida: ${entity}`,
            code: PurchaseOrderErrorCodes.REFERENCE_NOT_FOUND,
        });
    }
}