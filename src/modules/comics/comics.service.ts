import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import slugify from 'slugify';
import { CreateChapterDto } from '../chapters/dto/create-chapter.dto';
import * as sharp from 'sharp';
import * as os from 'os';
import { spawn } from 'child_process';
import { Prisma } from '@prisma/client';
import { FindComicsQueryDto, ComicSortBy } from './dto/find-comics-query.dto';
import { ComicPaginationResponseDto } from './dto/comic-list-response.dto';
import { RandomComicResponseDto } from './dto/random-comic-response.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PublishComicUploadDto } from './dto/publish-comic.dto';
import { PublishComicDocumentDto } from './dto/publish-comic-document.dto';
import { PublishComicResponseDto } from './dto/publish-comic-response.dto';
import {
  prepareChapterPagesPayload,
  writeChapterPagesToDisk,
} from '@/helper/comics';
import { NormalizedPage } from '@/types/comics';
import { ComicMetadataResponseDto } from './dto/comic-metadata.dto';
import { ComicChaptersResponseDto } from './dto/comic-chapters.dto';
import { ReorderChaptersDto } from './dto/reorder-chapters.dto';

@Injectable()
export class ComicsService {
  private readonly logger = new Logger(ComicsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async rateComic(comicId: string, rating: number) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        comicId,
      );

    const comic = await this.prisma.comics.findFirst({
      where: isUuid ? { id: comicId } : { legacy_id: BigInt(comicId) },
    });

    if (!comic) {
      throw new NotFoundException('Comic not found');
    }

    const newCount = comic.rating_count + 1;
    const newAverage = Math.round(
      (comic.rating_score * comic.rating_count + rating) / newCount,
    );

    await this.prisma.comics.update({
      where: { id: comic.id },
      data: {
        rating_score: newAverage,
        rating_count: newCount,
      },
    });

    return {
      success: true,
      message: 'Rating submitted successfully',
      data: {
        rating_score: newAverage,
        rating_count: newCount,
      },
    };
  }

  private splitMetadata(value?: string): string[] {
    if (!value) return [];
    return [
      ...new Set(
        value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    ];
  }

  private async upsertEntity(model: any, name: string) {
    const slug = slugify(name, {
      lower: true,
      strict: true,
    });
    const existing = await model.findFirst({
      where: {
        slug,
      },
    });
    if (existing) {
      return existing;
    }

    return model.create({
      data: {
        name,
        slug,
      },
    });
  }

  private async getNextLegacyId(tx: any): Promise<number> {
    const lastComic = await tx.comics.findFirst({
      orderBy: {
        legacy_id: 'desc',
      },
      select: {
        legacy_id: true,
      },
    });
    return Number(lastComic?.legacy_id || 0) + 1;
  }

  // HELPER: EXECUTE POPPLER
  private async executePoppler(
    pdfPath: string,
    outputPrefix: string,
  ): Promise<void> {
    const POPPLER_PATH = this.configService.get<string>('POPPLER_PATH');
    const DPI = this.configService.get<string>('PDF_RENDER_DPI') ?? '200';

    if (!POPPLER_PATH) {
      throw new BadRequestException('POPPLER_PATH is not configured');
    }

    const exe = path.join(
      POPPLER_PATH,
      process.platform === 'win32' ? 'pdftoppm.exe' : 'pdftoppm',
    );

    try {
      await fs.access(exe);
    } catch {
      throw new BadRequestException(`Poppler binary not found: ${exe}`);
    }

    const args = ['-png', '-r', DPI, pdfPath, outputPrefix];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(exe, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        console.error('========== POPPLER SPAWN ERROR ==========');
        console.error(err);
        console.error('=========================================');

        reject(
          new BadRequestException(`Failed to start Poppler: ${err.message}`),
        );
      });

      child.on('close', (code, signal) => {
        if (code === 0) {
          return resolve();
        }

        console.error('========== POPPLER ERROR ==========');
        console.error('Executable:', exe);
        console.error('Args:', args.join(' '));
        console.error('Exit Code:', code);
        console.error('Signal:', signal);
        console.error('stdout:', stdout);
        console.error('stderr:', stderr);
        console.error('===================================');

        reject(
          new BadRequestException(
            stderr || `Poppler exited with code=${code} signal=${signal}`,
          ),
        );
      });
    });
  }

  private isPdf(file: Express.Multer.File): boolean {
    return (
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf')
    );
  }

  private isGif(file: Express.Multer.File): boolean {
    return (
      file.mimetype === 'image/gif' ||
      file.originalname.toLowerCase().endsWith('.gif')
    );
  }

  private async normalizeImagePages(
    files: Express.Multer.File[],
  ): Promise<NormalizedPage[]> {
    return files.map((file, index) => ({
      pageNumber: index + 1,
      buffer: file.buffer,
      animated: this.isGif(file),
    }));
  }

  private async normalizePdfPages(
    file: Express.Multer.File,
  ): Promise<NormalizedPage[]> {
    const tempDir = await this.createTempDirectory();

    try {
      const pdfPath = path.join(tempDir, 'chapter.pdf');

      await fs.writeFile(pdfPath, file.buffer);

      const outputPrefix = path.join(tempDir, 'page');

      await this.executePoppler(pdfPath, outputPrefix);

      const rendered = await fs.readdir(tempDir);

      const imageFiles = rendered
        .filter((name) => /^page-\d+\.png$/i.test(name))
        .sort((a, b) =>
          a.localeCompare(b, undefined, {
            numeric: true,
          }),
        );

      if (!imageFiles.length) {
        throw new BadRequestException('No pages were rendered from PDF.');
      }

      const pages: NormalizedPage[] = [];

      for (let i = 0; i < imageFiles.length; i++) {
        pages.push({
          pageNumber: i + 1,
          buffer: await fs.readFile(path.join(tempDir, imageFiles[i])),
          animated: false,
        });
      }

      return pages;
    } finally {
      await this.removeTempDirectory(tempDir);
    }
  }

  // HELPER: NORMALIZE CHAPTER PAGES
  private async normalizePages(
    files: Express.Multer.File[],
  ): Promise<NormalizedPage[]> {
    if (!files.length) {
      return [];
    }

    const pdfFiles = files.filter((f) => this.isPdf(f));

    if (pdfFiles.length > 1) {
      throw new BadRequestException(
        'Only one PDF file can be uploaded per chapter.',
      );
    }

    if (pdfFiles.length === 1 && files.length > 1) {
      throw new BadRequestException(
        'Cannot upload PDF together with image files.',
      );
    }

    if (pdfFiles.length === 1) {
      return await this.normalizePdfPages(pdfFiles[0]);
    }

    return this.normalizeImagePages(files);
  }

  // HELPER: CREATE TEMP DIRECTORY
  private async createTempDirectory(prefix = 'komify-'): Promise<string> {
    return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  }

  // HELPER: REMOVE TEMP DIRECTORY
  private async removeTempDirectory(dir: string): Promise<void> {
    try {
      await fs.rm(dir, {
        recursive: true,
        force: true,
      });
    } catch {
      // ignore
    }
  }

  async getRandomComic(): Promise<RandomComicResponseDto> {
    try {
      const result = await this.prisma.$queryRaw<RandomComicResponseDto[]>`
      SELECT 
        id, 
        title, 
        seo_slug, 
        cover_path, 
        total_chapters
      FROM public.comics
      WHERE deleted_at IS NULL
      ORDER BY RANDOM()
      LIMIT 1;
    `;

      if (!result || result.length === 0) {
        throw new NotFoundException(
          'Tidak ada komik yang tersedia di database',
        );
      }

      return result[0];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Error fetching random comic via random query', error);
      throw new InternalServerErrorException('Gagal mengambil komik acak');
    }
  }

  async findAll(
    query: FindComicsQueryDto,
  ): Promise<ComicPaginationResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.comicsWhereInput = {
      deleted_at: null,
    };

    if (query.q?.trim()) {
      const searchTerm = query.q.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { alternative_title: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    if (query.category) {
      where.categories = {
        slug: query.category,
      };
    }

    if (query.status) {
      where.statuses = {
        name: {
          equals: query.status,
          mode: 'insensitive',
        },
      };
    }

    if (query.language) {
      where.chapters = {
        some: {
          language_code: query.language,
          deleted_at: null,
        },
      };
    }

    if (query.tags?.length) {
      where.comic_tags = {
        some: {
          tb_tags: {
            slug: { in: query.tags },
            deleted_at: null,
          },
        },
      };
    }

    if (query.parodies?.length) {
      where.comic_parodies = {
        some: {
          tb_parodies: {
            slug: { in: query.parodies },
            deleted_at: null,
          },
        },
      };
    }

    if (query.characters?.length) {
      where.comic_characters = {
        some: {
          tb_characters: {
            slug: { in: query.characters },
            deleted_at: null,
          },
        },
      };
    }

    if (query.artists?.length) {
      where.comic_artists = {
        some: {
          tb_artists: {
            slug: { in: query.artists },
            deleted_at: null,
          },
        },
      };
    }

    if (query.groups?.length) {
      where.comic_groups = {
        some: {
          tb_groups: {
            slug: { in: query.groups },
            deleted_at: null,
          },
        },
      };
    }

    if (query.authors?.length) {
      where.comic_authors = {
        some: {
          tb_authors: {
            slug: { in: query.authors },
            deleted_at: null,
          },
        },
      };
    }

    let orderBy: Prisma.comicsOrderByWithRelationInput;
    switch (query.sort) {
      case ComicSortBy.NEWEST:
        orderBy = { created_at: 'desc' };
        break;
      case ComicSortBy.POPULAR:
        orderBy = { view_count: 'desc' };
        break;
      case ComicSortBy.TITLE:
        orderBy = { title: 'asc' };
        break;
      case ComicSortBy.LATEST:
      default:
        orderBy = { legacy_id: 'desc' };
        break;
    }

    try {
      const [comics, total] = await Promise.all([
        this.prisma.comics.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          select: {
            id: true,
            legacy_id: true,
            title: true,
            alternative_title: true,
            cover_path: true,
            published_at: true,
            total_chapters: true,
            view_count: true,
            statuses: {
              select: {
                id: true,
                name: true,
              },
            },
            categories: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        }),
        this.prisma.comics.count({ where }),
      ]);

      const data = comics.map((comic) => ({
        id: comic.id,
        legacy_id: comic.legacy_id !== null ? Number(comic.legacy_id) : null,
        title: comic.title,
        alternative_title: comic.alternative_title,
        cover_path: comic.cover_path,
        published_at: comic.published_at,
        total_chapters: comic.total_chapters,
        view_count: Number(comic.view_count),
        status: comic.statuses,
        category: comic.categories,
      }));

      return {
        data,
        pagination: {
          page,
          limit,
          total_data: total,
          total_pages: Math.ceil(total / limit),
          has_prev: page > 1,
          has_next: page * limit < total,
        },
      };
    } catch (error) {
      this.logger.error('Error fetching comics list', error);
      throw new InternalServerErrorException('Gagal memuat daftar komik');
    }
  }

  // API to delete a comic by ID
  async deleteComic(comicId: string) {
    const comic = await this.prisma.comics.findUnique({
      where: {
        id: comicId,
      },
      include: {
        chapters: {
          include: {
            pages: true,
          },
        },
      },
    });
    if (!comic) {
      throw new NotFoundException('comic not found');
    }

    const deletedChapters = comic.chapters.length;
    const deletedPages = comic.chapters.reduce(
      (total, chapter) => total + chapter.pages.length,
      0,
    );
    const staticDir =
      process.env.STATIC_DIR || 'D:\\komify-server\\public\\komify_dev';
    const comicFolder = path.join(staticDir, String(comic.legacy_id));

    try {
      await fs.rm(comicFolder, {
        recursive: true,
        force: true,
      });
    } catch (error) {
      console.error(`failed delete folder: ${comicFolder}`, error);
    }

    await this.prisma.comics.delete({
      where: {
        id: comicId,
      },
    });

    return {
      success: true,
      comic_id: comicId,
      deleted_chapters: deletedChapters,
      deleted_pages: deletedPages,
      deleted_folder: comicFolder,
    };
  }

  async publishComic(
    files: Array<Express.Multer.File>,
    body: PublishComicUploadDto,
  ): Promise<PublishComicResponseDto> {
    const STATIC_DIR = this.configService.get<string>('STATIC_DIR');
    const STATIC_PREFIX = this.configService.get<string>('STATIC_PREFIX');
    if (!STATIC_DIR || !STATIC_PREFIX) {
      throw new BadRequestException(
        'Konfigurasi STATIC_DIR atau STATIC_PREFIX belum disetel',
      );
    }

    if (!body?.document) {
      throw new BadRequestException('Field "document" wajib diisi');
    }

    let parsedDoc: any;
    try {
      parsedDoc =
        typeof body.document === 'string'
          ? JSON.parse(body.document)
          : body.document;
    } catch {
      throw new BadRequestException(
        'Format JSON pada field "document" tidak valid',
      );
    }

    const document = plainToInstance(PublishComicDocumentDto, parsedDoc);
    const validationErrors = await validate(document);
    if (validationErrors.length > 0) {
      const messages = validationErrors
        .map((err) => Object.values(err.constraints || {}).join(', '))
        .join('; ');
      throw new BadRequestException(`Validasi dokumen gagal: ${messages}`);
    }

    if (!document.chapters || document.chapters.length === 0) {
      throw new BadRequestException('Komik wajib memiliki minimal 1 chapter');
    }

    const commonStatus = await this.prisma.common_code_details.findUnique({
      where: { id: document.status },
    });
    if (!commonStatus) {
      throw new BadRequestException(
        `Status Common Code ID '${document.status}' tidak ditemukan`,
      );
    }
    let status = await this.prisma.statuses.findFirst({
      where: { name: { equals: commonStatus.name, mode: 'insensitive' } },
    });
    if (!status) {
      status = await this.prisma.statuses.create({
        data: { name: commonStatus.name },
      });
    }

    let category = await this.prisma.categories.findFirst({
      where: { slug: document.template },
    });
    if (!category) {
      category = await this.prisma.categories.create({
        data: { name: document.template, slug: document.template },
      });
    }

    const censorshipIds = [
      ...new Set(document.chapters.map((ch) => ch.censorship_id)),
    ];
    const commonCensorships = await this.prisma.common_code_details.findMany({
      where: { id: { in: censorshipIds } },
    });

    const legacyCensorships = await this.prisma.censorships.findMany();
    const censorshipIdMap = new Map<string, string>();
    for (const cId of censorshipIds) {
      const cc = commonCensorships.find((c) => c.id === cId);
      if (!cc)
        throw new BadRequestException(
          `Censorship Common Code ID '${cId}' tidak ditemukan`,
        );

      let lc = legacyCensorships.find(
        (c) => c.name.toLowerCase() === cc.name.toLowerCase(),
      );
      if (!lc) {
        lc = await this.prisma.censorships.create({
          data: { name: cc.name },
        });
        legacyCensorships.push(lc);
      }

      censorshipIdMap.set(cId, lc.id);
    }

    const comicId = randomUUID();
    const legacyId = await this.getNextLegacyId(this.prisma);

    const coverFile = files.find((f) => f.fieldname === 'cover');
    const coverPath = coverFile
      ? `${STATIC_PREFIX}/${legacyId}/cover.webp`
      : `/default/cover.jpg`;

    const preparedChapters: Array<{
      id: string;
      chapter_number: string;
      title: string | null;
      language_code: string;
      censorship_id: string;
      total_pages: number;
      pagesPayload: any[];
      normalizedPages: NormalizedPage[];
    }> = [];

    for (const chapterData of document.chapters) {
      const chapterId = randomUUID();
      const mainPadded = String(chapterData.main).padStart(3, '0');
      const chapterNumber =
        Number(chapterData.sub) > 0
          ? `${mainPadded}.${chapterData.sub}`
          : mainPadded;

      const chapterFiles = files.filter(
        (f) => f.fieldname === `pages_${chapterData.id}`,
      );

      const normalizedPages = await this.normalizePages(chapterFiles);
      const pagesPayload = prepareChapterPagesPayload(
        legacyId,
        chapterId,
        chapterNumber,
        normalizedPages,
        this.configService,
      );

      preparedChapters.push({
        id: chapterId,
        chapter_number: chapterNumber,
        title: chapterData.title || null,
        language_code: chapterData.language.toLowerCase(),
        censorship_id: censorshipIdMap.get(chapterData.censorship_id)!,
        total_pages: chapterFiles.length,
        pagesPayload,
        normalizedPages,
      });
    }

    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.comics.create({
            data: {
              id: comicId,
              legacy_id: BigInt(legacyId),
              title: document.metadata.title,
              alternative_title: document.metadata.alternative_title || null,
              description: document.metadata.description || null,
              category_id: category.id,
              status_id: status.id,
              cover_path: coverPath,
              total_chapters: document.chapters.length,
              created_at: new Date(),
              updated_at: new Date(),
            },
          });

          const metadata = document.metadata;
          const metadataConfigs = [
            {
              raw: metadata.parodies,
              entity: tx.tb_parodies,
              junction: tx.comic_parodies,
              key: 'parody_id' as const,
            },
            {
              raw: metadata.characters,
              entity: tx.tb_characters,
              junction: tx.comic_characters,
              key: 'character_id' as const,
            },
            {
              raw: metadata.artists,
              entity: tx.tb_artists,
              junction: tx.comic_artists,
              key: 'artist_id' as const,
            },
            {
              raw: metadata.authors,
              entity: tx.tb_authors,
              junction: tx.comic_authors,
              key: 'author_id' as const,
            },
            {
              raw: metadata.groups,
              entity: tx.tb_groups,
              junction: tx.comic_groups,
              key: 'group_id' as const,
            },
            {
              raw: metadata.tags,
              entity: tx.tb_tags,
              junction: tx.comic_tags,
              key: 'tag_id' as const,
            },
          ];

          for (const config of metadataConfigs) {
            const rawString = Array.isArray(config.raw)
              ? config.raw.join(', ')
              : config.raw;

            const uniqueNames = [...new Set(this.splitMetadata(rawString))];

            if (uniqueNames.length > 0) {
              const junctionData: Record<string, any>[] = [];
              for (const name of uniqueNames) {
                const record = await this.upsertEntity(config.entity, name);
                junctionData.push({
                  comic_id: comicId,
                  [config.key]: record.id,
                });
              }

              await (config.junction as any).createMany({
                data: junctionData,
                skipDuplicates: true,
              });
            }
          }

          for (const ch of preparedChapters) {
            await tx.languages.upsert({
              where: { code: ch.language_code },
              create: {
                code: ch.language_code,
                name: ch.language_code.toUpperCase(),
              },
              update: {},
            });
            await tx.chapters.create({
              data: {
                id: ch.id,
                comic_id: comicId,
                chapter_number: ch.chapter_number,
                title: ch.title,
                language_code: ch.language_code,
                censorship_id: ch.censorship_id,
                total_pages: ch.total_pages,
              },
            });

            if (ch.pagesPayload.length > 0) {
              await tx.pages.createMany({
                data: ch.pagesPayload,
              });
            }
          }
        },
        { timeout: 60000 },
      );
    } catch (dbError) {
      if (dbError instanceof HttpException) throw dbError;
      this.logger.error('Gagal saat insert database komik:', dbError);
      throw new InternalServerErrorException(
        'Gagal menyimpan data komik ke database',
      );
    }

    const comicDir = path.join(STATIC_DIR, String(legacyId));

    try {
      try {
        await fs.mkdir(comicDir, { recursive: true });
      } catch (err: any) {
        if (err.code !== 'EEXIST') throw err;
      }

      if (coverFile) {
        const coverSavePath = path.join(comicDir, 'cover.webp');
        const isGif =
          coverFile.mimetype === 'image/gif' ||
          coverFile.originalname?.toLowerCase().endsWith('.gif');

        await sharp
          .default(coverFile.buffer, isGif ? { animated: true } : {})
          .webp({ quality: 85 })
          .toFile(coverSavePath);
      }

      for (const ch of preparedChapters) {
        await writeChapterPagesToDisk(
          legacyId,
          ch.chapter_number,
          ch.normalizedPages,
          this.configService,
        );
      }

      return {
        success: true,
        comic_id: comicId,
        legacy_id: String(legacyId),
      };
    } catch (fsError) {
      this.logger.error('Error saat menulis file/folder ke disk:', fsError);

      await this.prisma.comics
        .delete({ where: { id: comicId } })
        .catch((delErr) => {
          this.logger.error(
            `Gagal menghapus record rollback DB: ${comicId}`,
            delErr,
          );
        });

      await fs.rm(comicDir, { recursive: true, force: true }).catch(() => {});

      throw new InternalServerErrorException(
        'Gagal menulis file komik ke disk penyimpanan',
      );
    }
  }

  async createChapter(
    comicId: string,
    dto: CreateChapterDto,
    files: Express.Multer.File[],
  ) {
    const comic = await this.prisma.comics.findUnique({
      where: { id: comicId },
    });
    if (!comic) {
      throw new NotFoundException('comic not found');
    }

    const [language, censorship, existing] = await Promise.all([
      this.prisma.languages.findUnique({ where: { code: dto.language_code } }),
      this.prisma.censorships.findUnique({ where: { id: dto.censorship_id } }),
      this.prisma.chapters.findFirst({
        where: {
          comic_id: comicId,
          chapter_number: dto.chapter_number,
          language_code: dto.language_code,
        },
      }),
    ]);

    if (!censorship) throw new BadRequestException('invalid censorship');
    if (existing) throw new ConflictException('chapter already exists');

    if (files.length !== dto.pages?.length) {
      throw new BadRequestException(
        `pages count (${dto.pages?.length}) does not match uploaded files (${files.length})`,
      );
    }

    const tempIds = dto.pages.map((x) => x.temp_id);
    if (new Set(tempIds).size !== tempIds.length) {
      throw new BadRequestException('duplicate temp_id detected');
    }

    const pageNumbers = dto.pages.map((x) => x.page_number);
    if (new Set(pageNumbers).size !== pageNumbers.length) {
      throw new BadRequestException('duplicate page_number detected');
    }

    const chapterId = randomUUID();
    const normalizedPages = await this.normalizePages(files);
    const pagesPayload = prepareChapterPagesPayload(
      comic.legacy_id,
      chapterId,
      dto.chapter_number,
      normalizedPages,
      this.configService,
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.languages.upsert({
          where: { code: dto.language_code },
          create: {
            code: dto.language_code,
            name: dto.language_code.toUpperCase(),
          },
          update: {},
        });
        await tx.chapters.create({
          data: {
            id: chapterId,
            comic_id: comicId,
            title: dto.title,
            chapter_number: dto.chapter_number,
            language_code: dto.language_code,
            censorship_id: dto.censorship_id,
            total_pages: dto.pages.length,
          },
        });

        await tx.pages.createMany({
          data: pagesPayload,
        });

        const totalChapters = await tx.chapters.count({
          where: { comic_id: comicId, deleted_at: null },
        });

        await tx.comics.update({
          where: { id: comicId },
          data: { total_chapters: totalChapters },
        });
      });
    } catch (dbErr) {
      if (dbErr instanceof HttpException) throw dbErr;
      this.logger.error('Gagal saat menyimpan chapter ke database:', dbErr);
      throw new InternalServerErrorException(
        'Gagal menyimpan chapter ke database',
      );
    }

    try {
      await writeChapterPagesToDisk(
        comic.legacy_id,
        dto.chapter_number,
        normalizedPages,
        this.configService,
      );

      return {
        success: true,
        chapter_id: chapterId,
      };
    } catch (fsErr) {
      this.logger.error('Gagal menulis file chapter ke disk:', fsErr);

      await this.prisma.chapters
        .delete({ where: { id: chapterId } })
        .catch(() => {});
      const totalChapters = await this.prisma.chapters.count({
        where: { comic_id: comicId, deleted_at: null },
      });
      await this.prisma.comics
        .update({
          where: { id: comicId },
          data: { total_chapters: totalChapters },
        })
        .catch(() => {});

      throw new InternalServerErrorException(
        'Gagal menulis file chapter ke disk',
      );
    }
  }

  async editComic(
    comicId: string,
    files: Array<Express.Multer.File>,
    body: any,
  ) {
    try {
      const STATIC_DIR = this.configService.get<string>('STATIC_DIR');
      const STATIC_PREFIX = this.configService.get<string>('STATIC_PREFIX');

      if (!STATIC_DIR || !STATIC_PREFIX) {
        throw new BadRequestException('STATIC_DIR or STATIC_PREFIX missing');
      }

      if (!body.document) {
        throw new BadRequestException('document is required');
      }

      let document: any;
      try {
        document =
          typeof body.document === 'string'
            ? JSON.parse(body.document)
            : body.document;
      } catch {
        throw new BadRequestException('invalid document json');
      }

      const existingComic = await this.prisma.comics.findFirst({
        where: { id: comicId },
      });

      if (!existingComic) {
        throw new BadRequestException('comic not found');
      }

      const statusId = document.status_id || document.metadata?.status_id;
      let status;
      const isStatusUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          statusId,
        );

      if (isStatusUuid) {
        const commonStatus = await this.prisma.common_code_details.findUnique({
          where: { id: statusId },
        });
        if (commonStatus) {
          status = await this.prisma.statuses.findFirst({
            where: { name: { equals: commonStatus.name, mode: 'insensitive' } },
          });
          if (!status) {
            status = await this.prisma.statuses.create({
              data: { name: commonStatus.name },
            });
          }
        } else {
          status = await this.prisma.statuses.findFirst({
            where: { id: statusId },
          });
        }
      } else {
        status = await this.prisma.statuses.findFirst({
          where: { id: statusId },
        });
      }

      if (!status) {
        throw new BadRequestException('invalid status');
      }

      const categoryInput = document.template || document.metadata?.category;
      if (!categoryInput) {
        throw new BadRequestException('category is required');
      }

      const isCategoryUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          categoryInput,
        );

      let category;
      if (isCategoryUuid) {
        category = await this.prisma.categories.findFirst({
          where: { id: categoryInput },
        });
      } else {
        category = await this.prisma.categories.findFirst({
          where: { slug: categoryInput },
        });
      }

      if (!category && !isCategoryUuid) {
        category = await this.prisma.categories.create({
          data: { name: categoryInput, slug: categoryInput },
        });
      }

      if (!category) {
        throw new BadRequestException('invalid category');
      }

      const coverFile = files.find((f) => f.fieldname === 'cover');

      let coverPath = existingComic.cover_path;
      if (coverFile) {
        coverPath = `${STATIC_PREFIX}/${existingComic.legacy_id}/cover.webp`;
      } else if (document.cover_removed) {
        coverPath = `/default/cover.jpg`;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.comics.update({
          where: { id: comicId },
          data: {
            title: document.metadata.title,
            alternative_title: document.metadata.alternative_title || null,
            description: document.metadata.description || null,
            status_id: status.id,
            category_id: category.id,
            cover_path: coverPath,
            updated_at: new Date(),
          },
        });

        await tx.comic_parodies.deleteMany({ where: { comic_id: comicId } });
        await tx.comic_characters.deleteMany({ where: { comic_id: comicId } });
        await tx.comic_artists.deleteMany({ where: { comic_id: comicId } });
        await tx.comic_authors.deleteMany({ where: { comic_id: comicId } });
        await tx.comic_groups.deleteMany({ where: { comic_id: comicId } });
        await tx.comic_tags.deleteMany({ where: { comic_id: comicId } });

        const metadata = document.metadata;

        for (const item of this.splitMetadata(metadata.parodies)) {
          const parody = await this.upsertEntity(tx.tb_parodies, item);
          await tx.comic_parodies.create({
            data: { comic_id: comicId, parody_id: parody.id },
          });
        }

        for (const item of this.splitMetadata(metadata.characters)) {
          const character = await this.upsertEntity(tx.tb_characters, item);
          await tx.comic_characters.create({
            data: { comic_id: comicId, character_id: character.id },
          });
        }

        for (const item of this.splitMetadata(metadata.artists)) {
          const artist = await this.upsertEntity(tx.tb_artists, item);
          await tx.comic_artists.create({
            data: { comic_id: comicId, artist_id: artist.id },
          });
        }

        for (const item of this.splitMetadata(metadata.authors)) {
          const author = await this.upsertEntity(tx.tb_authors, item);
          await tx.comic_authors.create({
            data: { comic_id: comicId, author_id: author.id },
          });
        }

        for (const item of this.splitMetadata(metadata.groups)) {
          const group = await this.upsertEntity(tx.tb_groups, item);
          await tx.comic_groups.create({
            data: { comic_id: comicId, group_id: group.id },
          });
        }

        for (const item of this.splitMetadata(metadata.tags)) {
          const tag = await this.upsertEntity(tx.tb_tags, item);
          await tx.comic_tags.create({
            data: { comic_id: comicId, tag_id: tag.id },
          });
        }
      });

      if (coverFile) {
        const comicDir = path.join(STATIC_DIR, String(existingComic.legacy_id));
        try {
          await fs.mkdir(comicDir, { recursive: true });
        } catch (err: any) {
          if (err.code !== 'EEXIST') throw err;
        }

        const coverSavePath = path.join(comicDir, 'cover.webp');
        const isGif =
          coverFile.mimetype === 'image/gif' ||
          coverFile.originalname?.toLowerCase().endsWith('.gif');

        await sharp
          .default(coverFile.buffer, isGif ? { animated: true } : {})
          .webp({ quality: 85 })
          .toFile(coverSavePath);
      }

      return {
        success: true,
        comic_id: comicId,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Gagal memperbarui komik:', error);
      throw new InternalServerErrorException('Gagal memperbarui komik');
    }
  }

  // API to get chapter details by comic ID and chapter ID
  async getChapterDetail(comicId: string, chapterId: string) {
    const result = await this.prisma.$queryRawUnsafe(
      `
      SELECT fn_get_chapter_detail(
        $1::uuid,
        $2::uuid
      ) AS data
      `,
      comicId,
      chapterId,
    );

    return result?.[0]?.data ?? null;
  }

  async reorderChapters(comicId: string, dto: ReorderChaptersDto) {
    const baseTime = Date.now();

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < dto.chapter_ids.length; i++) {
        const id = dto.chapter_ids[i];
        const newNumber = String(i + 1).padStart(3, '0');
        await tx.chapters.update({
          where: { id },
          data: {
            chapter_number: `TEMP_${newNumber}`,
            created_at: new Date(baseTime + i * 1000),
          },
        });
      }

      for (let i = 0; i < dto.chapter_ids.length; i++) {
        const id = dto.chapter_ids[i];
        const newNumber = String(i + 1).padStart(3, '0');
        await tx.chapters.update({
          where: { id },
          data: {
            chapter_number: newNumber,
          },
        });
      }
    });

    return { success: true };
  }

  async getChaptersByComic(comicId: string): Promise<ComicChaptersResponseDto> {
    const commonLangs = await this.prisma.common_code_details.findMany({
      where: { type: { code: 'LANGUAGE' } },
    });
    const langMap = new Map(
      commonLangs.map((c) => [c.code.toLowerCase(), c.name]),
    );

    const commonCensors = await this.prisma.common_code_details.findMany({
      where: { type: { code: 'CENSORSHIP' } },
    });
    const censorMap = new Map(commonCensors.map((c) => [c.id, c.name]));

    const chapters = await this.prisma.chapters.findMany({
      where: {
        comic_id: comicId,
        deleted_at: null,
      },
      include: {
        languages: {
          select: { code: true, name: true },
        },
        censorships: {
          select: { id: true, name: true },
        },
        pages: {
          select: {
            id: true,
            filename: true,
            filepath: true,
            page_number: true,
          },
          orderBy: {
            page_number: 'asc',
          },
        },
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    return {
      comic_id: comicId,
      total_chapters: chapters.length,
      data: chapters.map((ch) => ({
        id: ch.id,
        title: ch.title ?? `Chapter ${ch.chapter_number}`,
        chapter_number: String(ch.chapter_number),
        total_pages: ch.total_pages,
        published_at: ch.published_at
          ? ch.published_at.toISOString()
          : ch.created_at.toISOString(),
        language: {
          code: ch.languages.code,
          name:
            langMap.get(ch.languages.code.toLowerCase()) || ch.languages.name,
        },
        censorship: {
          id: ch.censorships.id,
          name: censorMap.get(ch.censorships.id) || ch.censorships.name,
        },
        pages: ch.pages.map((p) => ({
          id: p.id,
          filename: p.filename,
          filepath: p.filepath,
          page_number: p.page_number,
        })),
      })),
    };
  }

  // API to get homepage comics with pagination
  async getHomepageComics(page = 1, limit = 12) {
    const result = await this.prisma.$queryRawUnsafe(
      `
    SELECT fn_get_homepage_comics(
      $1::integer,
      $2::integer
    ) AS data
    `,
      Number(page),
      Number(limit),
    );

    return result?.[0]?.data ?? null;
  }

  async getComicMetadata(
    comicId: string,
  ): Promise<ComicMetadataResponseDto | null> {
    const comic = await this.prisma.comics.findFirst({
      where: {
        id: comicId,
        deleted_at: null,
      },
      include: {
        statuses: {
          select: { id: true, name: true },
        },
        categories: {
          select: { id: true, name: true, slug: true },
        },
        comic_tags: {
          include: {
            tb_tags: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        comic_parodies: {
          include: {
            tb_parodies: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        comic_characters: {
          include: {
            tb_characters: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        comic_artists: {
          include: {
            tb_artists: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        comic_authors: {
          include: {
            tb_authors: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        comic_groups: {
          include: {
            tb_groups: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
    });

    if (!comic) {
      return null;
    }

    return {
      id: comic.id,
      title: comic.title,
      alternative_title: comic.alternative_title,
      description: comic.description,
      legacy_id: comic.legacy_id,
      cover_path: comic.cover_path,
      total_chapters: comic.total_chapters,
      rating_score: comic.rating_score,
      rating_count: comic.rating_count,
      status: {
        id: comic.statuses.id,
        name: comic.statuses.name,
      },
      category: {
        id: comic.categories.id,
        name: comic.categories.name,
        slug: comic.categories.slug,
      },
      tags: comic.comic_tags.map((item) => ({
        id: item.tb_tags.id,
        name: item.tb_tags.name,
        slug: item.tb_tags.slug,
      })),
      parodies: comic.comic_parodies.map((item) => ({
        id: item.tb_parodies.id,
        name: item.tb_parodies.name,
        slug: item.tb_parodies.slug,
      })),
      characters: comic.comic_characters.map((item) => ({
        id: item.tb_characters.id,
        name: item.tb_characters.name,
        slug: item.tb_characters.slug,
      })),
      artists: comic.comic_artists.map((item) => ({
        id: item.tb_artists.id,
        name: item.tb_artists.name,
        slug: item.tb_artists.slug,
      })),
      authors: comic.comic_authors.map((item) => ({
        id: item.tb_authors.id,
        name: item.tb_authors.name,
        slug: item.tb_authors.slug,
      })),
      groups: comic.comic_groups.map((item) => ({
        id: item.tb_groups.id,
        name: item.tb_groups.name,
        slug: item.tb_groups.slug,
      })),
      created_at: comic.created_at.toISOString(),
      updated_at: comic.updated_at.toISOString(),
    };
  }
}
