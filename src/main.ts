import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  const staticDir =
    process.env.STATIC_DIR ||
    join(process.cwd(), '..', '..', 'public', 'komify');

  const staticPrefix = process.env.STATIC_PREFIX || '/komify';

  app.useStaticAssets(staticDir, {
    prefix: staticPrefix,
  });

  const config = new DocumentBuilder()
    .setTitle(`Komify API (${process.env.NODE_ENV || 'development'})`)
    .setDescription('Dokumentasi REST API untuk layanan backend Komify')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 4000;
  await app.listen(port);

  console.log(`🚀 Server running on: http://localhost:${port}`);
  console.log(
    `📂 Serving static files from "${staticDir}" with prefix "${staticPrefix}"`,
  );
  console.log(`📚 Swagger Docs ready on: http://localhost:${port}/api/docs`);
}

bootstrap();
