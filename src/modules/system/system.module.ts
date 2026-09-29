import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { PrismaService } from '@/prisma/prisma.service';
import { CommonCodeModule } from './common-code/common-code.module';
import { SystemLogsModule } from './system-logs/system-logs.module';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';

@Module({
  controllers: [SystemController],
  providers: [
    SystemService,
    PrismaService,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
  imports: [CommonCodeModule, SystemLogsModule],
})
export class SystemModule {}
