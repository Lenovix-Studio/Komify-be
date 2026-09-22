import {
  BadRequestException,
  InternalServerErrorException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StatusResponseDto } from './dto/status-response.dto';
import * as fs from 'fs/promises';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CensorshipResponseDto } from './dto/censorship-response.dto';
import { LanguageResponseDto } from './dto/language-response.dto';

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);
  constructor(private readonly prisma: PrismaService) {}

  async getCategories(): Promise<CategoryResponseDto[]> {
    try {
      return await this.prisma.categories.findMany({
        where: {
          deleted_at: null,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: {
          name: 'asc',
        },
      });
    } catch (error) {
      this.logger.error('Failed to retrieve categories', error);
      throw new InternalServerErrorException('Gagal mengambil data kategori');
    }
  }

  async getStatuses(): Promise<StatusResponseDto[]> {
    try {
      return await this.prisma.statuses.findMany({
        orderBy: {
          id: 'asc',
        },
      });
    } catch (error) {
      this.logger.error('Failed to retrieve statuses', error);
      throw new InternalServerErrorException('Gagal mengambil data status');
    }
  }

  async getCensorships(): Promise<CensorshipResponseDto[]> {
    try {
      return await this.prisma.censorships.findMany({
        select: {
          id: true,
          name: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: {
          name: 'asc',
        },
      });
    } catch (error) {
      this.logger.error('Failed to retrieve censorships', error);
      throw new InternalServerErrorException('Gagal mengambil data sensor');
    }
  }

  async getLanguages(): Promise<LanguageResponseDto[]> {
    try {
      return await this.prisma.languages.findMany({
        select: {
          code: true,
          name: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: {
          name: 'asc',
        },
      });
    } catch (error) {
      this.logger.error('Failed to retrieve languages', error);
      throw new InternalServerErrorException('Gagal mengambil data bahasa');
    }
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
