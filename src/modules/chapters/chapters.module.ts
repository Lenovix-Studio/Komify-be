import { Module } from '@nestjs/common';
import { ChaptersController } from './chapters.controller';
import { ChaptersService } from './chapters.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { SystemLogsModule } from '@/modules/system/system-logs/system-logs.module';

@Module({
  imports: [PrismaModule, SystemLogsModule],
  controllers: [ChaptersController],
  providers: [ChaptersService],
})
export class ChaptersModule {}
