import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { SystemModule } from './modules/system/system.module';
import { ComicsModule } from './modules/comics/comics.module';
import { ChaptersModule } from './modules/chapters/chapters.module';
import { ScraperModule } from './modules/scraper/scraper.module';
import { BookmarksModule } from './modules/bookmarks/bookmarks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      isGlobal: true,
    }),
    ServeStaticModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          rootPath: configService.get<string>('STATIC_DIR'),
          serveRoot: configService.get<string>('STATIC_PREFIX'),
          serveStaticOptions: {
            index: false,
            fallthrough: false,
          },
        },
      ],
    }),
    PrismaModule,
    SystemModule,
    ComicsModule,
    ChaptersModule,
    ScraperModule,
    BookmarksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
