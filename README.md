<!-- For Development -->
npm run start:dev

<!-- For Production -->
npm run start:prod

//Prisma
npx prisma db pull or dotenv -e .env.development -- npx prisma db pull
npx prisma generate or dotenv -e .env.development -- npx prisma generate

Note:
- Before generate prisma, stop the service of nestjs