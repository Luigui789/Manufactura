import { Module } from '@nestjs/common';

import { DocumentSequenceService } from './document-sequence.service.js';

@Module({
  providers: [DocumentSequenceService],
  exports: [DocumentSequenceService],
})
export class DocumentSequenceModule {}
