import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { SystemModule } from './modules/system/system.module';
import { ComicsModule } from './modules/comics/comics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      // Membaca file .env.development atau .env.production secara dinamis
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      isGlobal: true, // Memastikan variabel env bisa diakses di seluruh module backend
    }),
    PrismaModule,
    SystemModule,
    ComicsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
