import {
  BadRequestException,
  InternalServerErrorException,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { StatusResponseDto } from './dto/status-response.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CensorshipResponseDto } from './dto/censorship-response.dto';
import { LanguageResponseDto } from './dto/language-response.dto';
import { clearDirectoryContents } from 'src/helper/comics';

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

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

  async resetAllData() {
    const nodeEnv =
      this.configService.get<string>('NODE_ENV') || process.env.NODE_ENV;
    if (nodeEnv === 'production') {
      throw new BadRequestException('Reset data is disabled in production');
    }

    this.logger.log('Executing database truncate...');
    await this.prisma.$executeRawUnsafe(`
      TRUNCATE TABLE 
        public.bookmarks,
        public.read_histories,
        public.search_indexes,
        public.pages,
        public.chapters,
        public.comic_artists,
        public.comic_authors,
        public.comic_characters,
        public.comic_groups,
        public.comic_parodies,
        public.comic_tags,
        public.comics,
        public.import_logs,
        public.tb_artists,
        public.tb_authors,
        public.tb_characters,
        public.tb_groups,
        public.tb_parodies,
        public.tb_tags
      RESTART IDENTITY CASCADE;
    `);

    const staticDirRelative = this.configService.get<string>('STATIC_DIR');
    let filesDeleted = false;

    if (staticDirRelative) {
      const targetDirectory = path.resolve(process.cwd(), staticDirRelative);
      this.logger.log(`Cleaning target directory: ${targetDirectory}`);

      try {
        await clearDirectoryContents(targetDirectory);
        filesDeleted = true;
      } catch (error: any) {
        this.logger.error(
          `Failed to clean directory ${targetDirectory}: ${error.message}`,
        );
        throw new BadRequestException(
          `Database truncated, but failed to clean storage directory: ${error.message}`,
        );
      }
    }

    return {
      success: true,
      message:
        'All database data and physical assets have been successfully reset',
      storageCleaned: filesDeleted,
    };
  }
}
