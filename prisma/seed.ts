import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

const categoriesData = [
  { name: 'Manga', slug: 'manga' },
  { name: 'Doujinshi', slug: 'doujinshi' },
  { name: 'Manhwa', slug: 'manhwa' },
];

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Seed Table: languages
  const language = await prisma.languages.upsert({
    where: { code: 'en' },
    update: {},
    create: {
      code: 'en',
      name: 'English',
    },
  });
  console.log(`✅ Seeded language: ${language.name} (${language.code})`);

  // 2. Seed Table: categories
  const seededCategories = await Promise.all(
    categoriesData.map((cat) =>
      prisma.categories.upsert({
        where: { name: cat.name },
        update: {},
        create: cat,
      }),
    ),
  );

  seededCategories.forEach((cat) => {
    console.log(`✅ Seeded category: ${cat.name}`);
  });

  // 3. Seed Table: statuses
  const status = await prisma.statuses.upsert({
    where: { name: 'Ongoing' },
    update: {},
    create: {
      name: 'Ongoing',
    },
  });
  console.log(`✅ Seeded status: ${status.name}`);

  // 4. Seed Table: censorships
  const censorship = await prisma.censorships.upsert({
    where: { name: 'Uncensored' },
    update: {},
    create: {
      name: 'Uncensored',
    },
  });
  console.log(`✅ Seeded censorship: ${censorship.name}`);

  console.log('🚀 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
