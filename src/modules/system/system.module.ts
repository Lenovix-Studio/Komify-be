import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { PrismaService } from '@/prisma/prisma.service';
import { CommonCodeModule } from './common-code/common-code.module';

@Module({
  controllers: [SystemController],
  providers: [SystemService, PrismaService],
  imports: [CommonCodeModule],
})
export class SystemModule {}
