import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs/promises';

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  // Get all active categories
  async getCategories() {
    return this.prisma.categories.findMany({
      where: {
        deleted_at: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  // Gets statuses from the database
  async getStatuses() {
    const result = await this.prisma.$queryRawUnsafe<
      Array<{
        fn_get_statuses: any;
      }>
    >(`
      SELECT public.fn_get_statuses()
    `);

    return result?.[0]?.fn_get_statuses ?? [];
  }

  // Gets censorships from the database
  async getCensorships() {
    const result = await this.prisma.$queryRawUnsafe<
      Array<{
        fn_get_censorships: any;
      }>
    >(`
      SELECT public.fn_get_censorships()
    `);

    return result?.[0]?.fn_get_censorships ?? [];
  }

  // Gets languages from the database
  async getLanguages() {
    const result = await this.prisma.$queryRawUnsafe<
      Array<{
        fn_get_languages: any;
      }>
    >(`
      SELECT public.fn_get_languages()
    `);

    return result?.[0]?.fn_get_languages ?? [];
  }

  // Imports comics from a JSON file
  async importComicsFile(filePath: string) {
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const jsonData = JSON.parse(fileContent);

      await this.prisma.$executeRawUnsafe(
        `
        SELECT public.fn_import_comics($1::jsonb);
        `,
        JSON.stringify(jsonData),
      );

      return {
        success: true,
        message: 'Comics imported successfully',
      };
    } finally {
      try {
        await fs.unlink(filePath);
      } catch {}
    }
  }

  // Imports comics from a JSON
  async importComics(jsonData: unknown) {
    await this.prisma.$executeRawUnsafe(
      `
      SELECT public.fn_import_comics($1::jsonb);
      `,
      JSON.stringify(jsonData),
    );

    return {
      success: true,
      message: 'Comics imported successfully',
    };
  }

  // Resets all data in the database
  async resetAllData() {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Reset data is disabled in production');
    }

    await this.prisma.$executeRawUnsafe(`
      SELECT public.fn_reset_all_data();
    `);

    return {
      success: true,
      message: 'All data has been reset',
    };
  }
}
