import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import * as fs from 'fs/promises';

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  // Imports comics from a JSON file
  async importComicsFile(filePath: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Import comics is disabled in production');
    }

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
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Import comics is disabled in production');
    }

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
