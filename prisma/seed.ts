import { PrismaClient } from '@prisma/client';
import * as data from './seed-data.json';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding common_code_types and common_code_details...');

  for (const type of data.types) {
    await prisma.common_code_types.upsert({
      where: { id: type.id },
      update: type,
      create: type,
    });
  }

  for (const detail of data.details) {
    await prisma.common_code_details.upsert({
      where: { id: detail.id },
      update: detail,
      create: detail,
    });
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
