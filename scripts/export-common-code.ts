import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const cliArgs = process.argv.slice(2);
const TARGET_CODES = cliArgs.length > 0 ? cliArgs : ['STATUS'];

async function exportCommonCode() {
  console.log(
    `🔄 Fetching common code types & details for: ${TARGET_CODES.join(', ')}...`,
  );

  try {
    const typesData = await prisma.common_code_types.findMany({
      where: {
        code: {
          in: TARGET_CODES,
        },
        deleted_at: null,
      },
      include: {
        details: {
          where: {
            deleted_at: null,
          },
          orderBy: {
            sort_order: 'asc',
          },
        },
      },
    });

    if (!typesData.length) {
      console.log('⚠️ No matching common code types found in database.');
      return;
    }

    const seedContent = `// Auto-generated seed file on ${new Date().toISOString()}

export const commonCodeTypesSeed = ${JSON.stringify(
      typesData.map(({ details, ...type }) => type),
      null,
      2,
    )};

export const commonCodeDetailsSeed = ${JSON.stringify(
      typesData.flatMap((type) => type.details),
      null,
      2,
    )};
`;

    const outputDir = path.join(process.cwd(), 'prisma/seeds');
    const outputPath = path.join(outputDir, 'common-code.seed.ts');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, seedContent, 'utf-8');

    const totalDetails = typesData.reduce(
      (acc, t) => acc + t.details.length,
      0,
    );
    console.log(
      `✅ Exported ${typesData.length} types and ${totalDetails} details successfully to: ${outputPath}`,
    );
  } catch (error) {
    console.error('❌ Failed to export common code seeds:', error);
  } finally {
    await prisma.$disconnect();
  }
}

exportCommonCode();
