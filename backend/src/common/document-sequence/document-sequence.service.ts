import { Injectable } from '@nestjs/common';

import { type DocumentType, type Prisma } from '../../generated/prisma/client.js';

const BUSINESS_TIME_ZONE = 'America/Managua';

// Keeping this exhaustive makes new document types require an intentional prefix.
const DOCUMENT_PREFIX: Record<DocumentType, string> = {
  LOT: 'LOT',
  OP: 'OP',
  PURCHASE_ORDER: 'OC',
  PURCHASE_RECEIPT: 'REC',
  SALE_ORDER: 'OV',
};

@Injectable()
export class DocumentSequenceService {
  /**
   * Reserves the next human-readable code inside the caller's transaction.
   * The returned code must not be exposed as final until that transaction commits.
   */
  async nextCode(
    tx: Prisma.TransactionClient,
    documentType: DocumentType,
    occurredAt: Date = new Date(),
  ): Promise<string> {
    const codes = await this.nextCodes(tx, [documentType], occurredAt);
    return codes.get(documentType)![0];
  }

  /**
   * Reserves several codes in a stable type/year order. Callers that need more
   * than one sequence in a transaction must use this method to avoid deadlocks.
   */
  async nextCodes(
    tx: Prisma.TransactionClient,
    documentTypes: readonly DocumentType[],
    occurredAt: Date = new Date(),
  ): Promise<ReadonlyMap<DocumentType, readonly string[]>> {
    const year = this.getBusinessYear(occurredAt);
    const counts = new Map<DocumentType, number>();
    for (const documentType of documentTypes) {
      counts.set(documentType, (counts.get(documentType) ?? 0) + 1);
    }
    const sortedTypes = [...counts.keys()].sort();
    const codes = new Map<DocumentType, readonly string[]>();

    for (const documentType of sortedTypes) {
      const count = counts.get(documentType)!;
      // Concurrent first use is safe: the unique constraint chooses one row and
      // skipDuplicates lets the other transaction continue to the same row lock.
      await tx.documentSequence.createMany({
        data: [{ documentType, year }],
        skipDuplicates: true,
      });

      const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM document_sequences
        WHERE document_type = ${documentType}::"DocumentType"
          AND year = ${year}
        FOR UPDATE
      `;
      if (lockedRows.length === 0) {
        throw new Error('No se pudo bloquear el contador del documento');
      }

      const sequence = await tx.documentSequence.update({
        where: { documentType_year: { documentType, year } },
        data: { lastNumber: { increment: count } },
        select: { lastNumber: true },
      });

      const prefix = DOCUMENT_PREFIX[documentType];
      const firstNumber = sequence.lastNumber - count + 1;
      codes.set(
        documentType,
        Array.from({ length: count }, (_, index) => {
          const number = firstNumber + index;
          return `${prefix}-${year}-${String(number).padStart(6, '0')}`;
        }),
      );
    }

    return codes;
  }

  private getBusinessYear(date: Date): number {
    if (Number.isNaN(date.getTime())) {
      throw new RangeError('La fecha de numeración no es válida');
    }

    const year = new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TIME_ZONE,
      year: 'numeric',
    })
      .formatToParts(date)
      .find((part) => part.type === 'year')?.value;

    if (!year) {
      throw new RangeError('No se pudo determinar el año de Managua');
    }
    return Number(year);
  }
}
