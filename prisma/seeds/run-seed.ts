import { PrismaClient } from '@prisma/client';
import { commonCodeTypesSeed, commonCodeDetailsSeed } from './common-code.seed';

const prisma = new PrismaClient();

async function runSeed() {
  console.log('🚀 Seeding common_code_types and common_code_details...');

  try {
    for (const type of commonCodeTypesSeed) {
      await prisma.common_code_types.upsert({
        where: { id: type.id },
        update: {
          code: type.code,
          name: type.name,
          description: type.description,
          updated_at: new Date(type.updated_at),
          deleted_at: type.deleted_at ? new Date(type.deleted_at) : null,
        },
        create: {
          id: type.id,
          code: type.code,
          name: type.name,
          description: type.description,
          created_at: new Date(type.created_at),
          updated_at: new Date(type.updated_at),
          deleted_at: type.deleted_at ? new Date(type.deleted_at) : null,
        },
      });
    }
    console.log(`✅ Upserted ${commonCodeTypesSeed.length} common_code_types.`);

    for (const detail of commonCodeDetailsSeed) {
      await prisma.common_code_details.upsert({
        where: {
          type_id_code: {
            type_id: detail.type_id,
            code: detail.code,
          },
        },
        update: {
          name: detail.name,
          sort_order: detail.sort_order,
          is_active: detail.is_active,
          updated_at: new Date(detail.updated_at),
          deleted_at: detail.deleted_at ? new Date(detail.deleted_at) : null,
        },
        create: {
          id: detail.id,
          type_id: detail.type_id,
          code: detail.code,
          name: detail.name,
          sort_order: detail.sort_order,
          is_active: detail.is_active,
          created_at: new Date(detail.created_at),
          updated_at: new Date(detail.updated_at),
          deleted_at: detail.deleted_at ? new Date(detail.deleted_at) : null,
        },
      });
    }
    console.log(
      `✅ Upserted ${commonCodeDetailsSeed.length} common_code_details.`,
    );

    console.log('🎉 Common Code Seed completed successfully!');
  } catch (error) {
    console.error('❌ Failed to run seed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runSeed();
