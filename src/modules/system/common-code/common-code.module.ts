import { Module } from '@nestjs/common';
import { CommonCodeController } from './common-code.controller';
import { CommonCodeService } from './common-code.service';
import { PrismaService } from '@/prisma/prisma.service';

@Module({
  controllers: [CommonCodeController],
  providers: [CommonCodeService, PrismaService],
})
export class CommonCodeModule {}
