import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  const staticDir =
    process.env.STATIC_DIR ||
    join(process.cwd(), '..', '..', 'public', 'komify');

  app.useStaticAssets(staticDir, {
    prefix: '/komify',
  });

  await app.listen(process.env.PORT ?? 4000);
}

bootstrap();
