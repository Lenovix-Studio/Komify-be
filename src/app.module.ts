import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { SystemModule } from './modules/system/system.module';
import { ComicsModule } from './modules/comics/comics.module';
import { ChaptersModule } from './modules/chapters/chapters.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      isGlobal: true,
    }),
    // Mengubah ke async agar variabel dari .env terbaca dengan pasti saat runtime
    ServeStaticModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          rootPath: configService.get<string>('STATIC_DIR'),
          serveRoot: configService.get<string>('STATIC_PREFIX'),
          serveStaticOptions: {
            index: false, // Mematikan pencarian otomatis ke index.html jika file tidak ada
            fallthrough: false, // Memaksa server langsung merespon jika file fisik tidak ditemukan
          },
        },
      ],
    }),
    PrismaModule,
    SystemModule,
    ComicsModule,
    ChaptersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
