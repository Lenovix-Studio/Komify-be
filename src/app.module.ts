import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { PrismaModule } from './prisma/prisma.module';
import { SystemModule } from './modules/system/system.module';
import { ComicsModule } from './modules/comics/comics.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: process.env.STATIC_DIR,
      serveRoot: process.env.STATIC_PREFIX,
    }),
    PrismaModule,
    SystemModule,
    ComicsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
