import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  HttpException,
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
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

type NormalizedPage = {
  pageNumber: number;
  buffer: Buffer;
  animated: boolean;
};

@Injectable()
export class ComicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

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

  // HELPER: PREPARE CHAPTER PAGES
  private async prepareChapterPages(
    legacyId: number | bigint,
    chapterId: string,
    chapterNumber: string,
    pages: NormalizedPage[],
  ) {
    const STATIC_DIR = this.configService.get<string>('STATIC_DIR') ?? '';
    const chapterDir = path.join(
      STATIC_DIR,
      String(legacyId),
      'chapters',
      chapterNumber,
    );
    await fs.mkdir(chapterDir, { recursive: true });

    const pagesPayload: {
      chapter_id: string;
      page_number: number;
      filename: string;
      filepath: string;
      filesize: bigint;
    }[] = [];

    for (const page of pages) {
      const { filepath, filesize, filename } = await this.saveChapterPage(
        legacyId,
        chapterNumber,
        page.buffer,
        page.pageNumber,
        {
          animated: page.animated,
        },
      );

      pagesPayload.push({
        chapter_id: chapterId,
        page_number: page.pageNumber,
        filename,
        filepath,
        filesize,
      });
    }

    return pagesPayload;
  }

  // API to get a random comic
  async getRandomComic() {
    try {
      const count = await this.prisma.comics.count();
      if (count === 0) {
        throw new NotFoundException('No comics available in database');
      }

      const randomIndex = Math.floor(Math.random() * count);
      const comics = await this.prisma.comics.findMany({
        take: 1,
        skip: randomIndex,
        select: {
          id: true,
          title: true,
          seo_slug: true,
          cover_path: true,
          total_chapters: true,
        },
      });

      if (!comics || comics.length === 0) {
        throw new NotFoundException('No comic found');
      }

      return comics[0];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error fetching random comic:', error);
      throw new InternalServerErrorException('Failed to fetch random comic');
    }
  }

  // API to get all comics with pagination and filtering
  async findAll(query: {
    page?: number;
    limit?: number;
    q?: string;
    category?: string;
    status?: string;
    language?: string;
    tags?: string[];
    parodies?: string[];
    characters?: string[];
    artists?: string[];
    groups?: string[];
    authors?: string[];
    sort?: string;
  }) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 10);
    const skip = (page - 1) * limit;
    const where: any = {
      deleted_at: null,
    };

    // =========================
    // SEARCH
    // =========================

    if (query.q?.trim()) {
      where.OR = [
        {
          title: {
            contains: query.q,
            mode: 'insensitive',
          },
        },
        {
          alternative_title: {
            contains: query.q,
            mode: 'insensitive',
          },
        },
      ];
    }

    // =========================
    // CATEGORY
    // =========================

    if (query.category) {
      where.categories = {
        slug: query.category,
      };
    }

    // =========================
    // STATUS
    // =========================

    if (query.status) {
      where.statuses = {
        name: {
          equals: query.status,
          mode: 'insensitive',
        },
      };
    }

    // =========================
    // LANGUAGE
    // =========================

    if (query.language) {
      where.chapters = {
        some: {
          language_code: query.language,
        },
      };
    }

    // =========================
    // TAGS
    // =========================

    if (query.tags?.length) {
      where.comic_tags = {
        some: {
          tb_tags: {
            slug: {
              in: query.tags,
            },
          },
        },
      };
    }

    // =========================
    // PARODIES
    // =========================

    if (query.parodies?.length) {
      where.comic_parodies = {
        some: {
          tb_parodies: {
            slug: {
              in: query.parodies,
            },
          },
        },
      };
    }

    // =========================
    // CHARACTERS
    // =========================

    if (query.characters?.length) {
      where.comic_characters = {
        some: {
          tb_characters: {
            slug: {
              in: query.characters,
            },
          },
        },
      };
    }

    // =========================
    // ARTISTS
    // =========================

    if (query.artists?.length) {
      where.comic_artists = {
        some: {
          tb_artists: {
            slug: {
              in: query.artists,
            },
          },
        },
      };
    }

    // =========================
    // GROUPS
    // =========================

    if (query.groups?.length) {
      where.comic_groups = {
        some: {
          tb_groups: {
            slug: {
              in: query.groups,
            },
          },
        },
      };
    }

    // =========================
    // AUTHORS
    // =========================

    if (query.authors?.length) {
      where.comic_authors = {
        some: {
          tb_authors: {
            slug: {
              in: query.authors,
            },
          },
        },
      };
    }

    // =========================
    // SORT
    // =========================

    let orderBy: any = {
      legacy_id: 'desc',
    };

    switch (query.sort) {
      case 'newest':
        orderBy = {
          created_at: 'desc',
        };
        break;

      case 'popular':
        orderBy = {
          view_count: 'desc',
        };
        break;

      case 'title':
        orderBy = {
          title: 'asc',
        };
        break;

      case 'latest':
      default:
        orderBy = {
          legacy_id: 'desc',
        };
        break;
    }

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

      this.prisma.comics.count({
        where,
      }),
    ]);

    const data = comics.map((comic) => ({
      id: comic.id,
      legacy_id: comic.legacy_id,
      title: comic.title,
      alternative_title: comic.alternative_title,
      cover_path: comic.cover_path,
      published_at: comic.published_at,
      total_chapters: comic.total_chapters,
      view_count: comic.view_count,
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

  // ================================================================
  // HELPER: SAVE CHAPTER PAGE & CONVERT TO WEBP
  // ================================================================
  private async saveChapterPage(
    legacyId: number | bigint,
    chapterNumber: string,
    buffer: Buffer,
    pageNumber: number,
    options?: {
      animated?: boolean;
      quality?: number;
    },
  ): Promise<{
    filepath: string;
    filesize: bigint;
    filename: string;
  }> {
    const STATIC_DIR = this.configService.get<string>('STATIC_DIR');
    const STATIC_PREFIX = this.configService.get<string>('STATIC_PREFIX');

    if (!STATIC_DIR || !STATIC_PREFIX) {
      throw new BadRequestException('STATIC_DIR or STATIC_PREFIX missing');
    }

    const baseDir = path.join(
      STATIC_DIR,
      String(legacyId),
      'chapters',
      chapterNumber,
    );

    const filename = `page${pageNumber}.webp`;
    const fullPath = path.join(baseDir, filename);

    const quality = options?.quality ?? 80;

    let webpInfo: sharp.OutputInfo;

    try {
      webpInfo = await sharp
        .default(buffer, options?.animated ? { animated: true } : {})
        .webp({
          quality,
        })
        .toFile(fullPath);
    } catch (err) {
      throw new BadRequestException(
        `Failed to convert page ${pageNumber} to WebP for chapter ${chapterNumber}`,
      );
    }

    return {
      filepath: `${STATIC_PREFIX}/${legacyId}/chapters/${chapterNumber}/${filename}`,
      filesize: BigInt(webpInfo.size),
      filename,
    };
  }

  // ================================================================
  // API TO CREATE A NEW CHAPTER FOR A COMIC
  // ================================================================
  async createChapter(
    comicId: string,
    dto: CreateChapterDto,
    files: Express.Multer.File[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const comic = await tx.comics.findUnique({
        where: {
          id: comicId,
        },
      });
      if (!comic) {
        throw new NotFoundException('comic not found');
      }

      const language = await tx.languages.findUnique({
        where: {
          code: dto.language_code,
        },
      });
      if (!language) {
        throw new BadRequestException('invalid language');
      }

      const censorship = await tx.censorships.findUnique({
        where: {
          id: dto.censorship_id,
        },
      });
      if (!censorship) {
        throw new BadRequestException('invalid censorship');
      }

      const existing = await tx.chapters.findFirst({
        where: {
          comic_id: comicId,
          chapter_number: dto.chapter_number,
          language_code: dto.language_code,
        },
      });
      if (existing) {
        throw new ConflictException('chapter already exists');
      }

      if (files.length !== dto.pages?.length) {
        throw new BadRequestException(
          `pages count (${dto.pages?.length}) does not match uploaded files (${files.length})`,
        );
      }

      const tempIds = dto.pages.map((x) => x.temp_id);
      const duplicateTempIds = tempIds.filter(
        (item, index) => tempIds.indexOf(item) !== index,
      );
      if (duplicateTempIds.length > 0) {
        throw new BadRequestException(
          `duplicate temp_id detected: ${duplicateTempIds.join(', ')}`,
        );
      }

      const pageNumbers = dto.pages.map((x) => x.page_number);
      const duplicatePageNumbers = pageNumbers.filter(
        (item, index) => pageNumbers.indexOf(item) !== index,
      );
      if (duplicatePageNumbers.length > 0) {
        throw new BadRequestException(
          `duplicate page_number detected: ${duplicatePageNumbers.join(', ')}`,
        );
      }

      // Create chapter
      const chapter = await tx.chapters.create({
        data: {
          comic_id: comicId,
          title: dto.title,
          chapter_number: dto.chapter_number,
          language_code: dto.language_code,
          censorship_id: dto.censorship_id,
          total_pages: dto.pages.length,
        },
      });

      const normalizedPages = await this.normalizePages(files);

      const pagesPayload = await this.prepareChapterPages(
        comic.legacy_id,
        chapter.id,
        dto.chapter_number,
        normalizedPages,
      );

      await tx.pages.createMany({
        data: pagesPayload,
      });

      const totalChapters = await tx.chapters.count({
        where: {
          comic_id: comicId,
          deleted_at: null,
        },
      });
      await tx.comics.update({
        where: {
          id: comicId,
        },
        data: {
          total_chapters: totalChapters,
        },
      });
      return {
        success: true,
        chapter_id: chapter.id,
      };
    });
  }

  // API to edit an existing comic
  async editComic(
    comicId: string,
    files: Array<Express.Multer.File>,
    body: any,
  ) {
    try {
      // =========================
      // ENV
      // =========================
      const STATIC_DIR = this.configService.get<string>('STATIC_DIR');
      const STATIC_PREFIX = this.configService.get<string>('STATIC_PREFIX');

      if (!STATIC_DIR || !STATIC_PREFIX) {
        throw new BadRequestException('STATIC_DIR or STATIC_PREFIX missing');
      }

      // =========================
      // PARSE DOCUMENT
      // =========================
      if (!body.document) {
        throw new BadRequestException('document is required');
      }

      let document: any;
      try {
        document = JSON.parse(body.document);
      } catch {
        throw new BadRequestException('invalid document json');
      }

      // =========================
      // FIND COMIC
      // =========================
      const existingComic = await this.prisma.comics.findFirst({
        where: {
          id: comicId,
        },
      });

      if (!existingComic) {
        throw new BadRequestException('comic not found');
      }

      // =========================
      // VALIDATE STATUS
      // =========================
      const statusId = document.status_id || document.metadata?.status_id;
      const status = await this.prisma.statuses.findFirst({
        where: {
          id: statusId,
        },
      });

      if (!status) {
        throw new BadRequestException('invalid status');
      }

      // =========================
      // VALIDATE CATEGORY
      // =========================
      const categoryInput = document.template || document.metadata?.category;

      if (!categoryInput) {
        throw new BadRequestException('category is required');
      }

      // Cek apakah categoryInput berupa format UUID (v4/standard)
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          categoryInput,
        );

      const category = await this.prisma.categories.findFirst({
        where: isUuid ? { id: categoryInput } : { slug: categoryInput },
      });

      if (!category) {
        throw new BadRequestException('invalid category');
      }

      // =========================
      // COVER PROCESSING
      // =========================
      const coverFile = files.find((f) => f.fieldname === 'cover');
      let coverPath = existingComic.cover_path;

      if (coverFile) {
        const comicDir = path.join(STATIC_DIR, String(existingComic.legacy_id));

        const coverFilename = `cover.webp`;
        const coverSavePath = path.join(comicDir, coverFilename);
        const isGif =
          coverFile.mimetype === 'image/gif' ||
          coverFile.originalname?.toLowerCase().endsWith('.gif');

        try {
          await sharp
            .default(coverFile.buffer, isGif ? { animated: true } : {})
            .webp({ quality: 85 })
            .toFile(coverSavePath);
        } catch (err) {
          throw new BadRequestException(
            'Gagal mengonversi cover baru ke format WebP',
          );
        }

        coverPath = `${STATIC_PREFIX}/${existingComic.legacy_id}/${coverFilename}`;
      }

      // =========================
      // TRANSACTION
      // =========================
      return await this.prisma.$transaction(async (tx) => {
        // UPDATE COMIC
        await tx.comics.update({
          where: {
            id: comicId,
          },
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

        // DELETE OLD RELATIONS
        await tx.comic_parodies.deleteMany({ where: { comic_id: comicId } });
        await tx.comic_characters.deleteMany({ where: { comic_id: comicId } });
        await tx.comic_artists.deleteMany({ where: { comic_id: comicId } });
        await tx.comic_authors.deleteMany({ where: { comic_id: comicId } });
        await tx.comic_groups.deleteMany({ where: { comic_id: comicId } });
        await tx.comic_tags.deleteMany({ where: { comic_id: comicId } });

        // METADATA INSERTS
        const metadata = document.metadata;

        // PARODIES
        for (const item of this.splitMetadata(metadata.parodies)) {
          const parody = await this.upsertEntity(tx.tb_parodies, item);
          await tx.comic_parodies.create({
            data: { comic_id: comicId, parody_id: parody.id },
          });
        }

        // CHARACTERS
        for (const item of this.splitMetadata(metadata.characters)) {
          const character = await this.upsertEntity(tx.tb_characters, item);
          await tx.comic_characters.create({
            data: { comic_id: comicId, character_id: character.id },
          });
        }

        // ARTISTS
        for (const item of this.splitMetadata(metadata.artists)) {
          const artist = await this.upsertEntity(tx.tb_artists, item);
          await tx.comic_artists.create({
            data: { comic_id: comicId, artist_id: artist.id },
          });
        }

        // AUTHORS
        for (const item of this.splitMetadata(metadata.authors)) {
          const author = await this.upsertEntity(tx.tb_authors, item);
          await tx.comic_authors.create({
            data: { comic_id: comicId, author_id: author.id },
          });
        }

        // GROUPS
        for (const item of this.splitMetadata(metadata.groups)) {
          const group = await this.upsertEntity(tx.tb_groups, item);
          await tx.comic_groups.create({
            data: { comic_id: comicId, group_id: group.id },
          });
        }

        // TAGS
        for (const item of this.splitMetadata(metadata.tags)) {
          const tag = await this.upsertEntity(tx.tb_tags, item);
          await tx.comic_tags.create({
            data: { comic_id: comicId, tag_id: tag.id },
          });
        }

        return {
          success: true,
          comic_id: comicId,
        };
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        error || 'Gagal memperbarui komik',
      );
    }
  }

  /// API to publish a new comic
  async publishComic(files: Array<Express.Multer.File>, body: any) {
    // =========================
    // ENV
    // =========================
    const STATIC_DIR = this.configService.get<string>('STATIC_DIR');
    const STATIC_PREFIX = this.configService.get<string>('STATIC_PREFIX');
    if (!STATIC_DIR || !STATIC_PREFIX) {
      throw new BadRequestException('STATIC_DIR or STATIC_PREFIX missing');
    }

    // =========================
    // PARSE JSON DOCUMENT
    // =========================
    if (!body.document) {
      throw new BadRequestException('document is required');
    }

    let document: any;
    try {
      document = JSON.parse(body.document);
    } catch {
      throw new BadRequestException('invalid document json');
    }

    // =========================
    // VALIDASI DASAR
    // =========================
    if (!document.metadata?.title) {
      throw new BadRequestException('title is required');
    }
    if (!document.chapters?.length) {
      throw new BadRequestException('chapters is required');
    }

    // =========================
    // COVER
    // =========================
    const coverFile = files.find((f) => f.fieldname === 'cover');

    // =========================
    // STATUS
    // =========================
    const status = await this.prisma.statuses.findFirst({
      where: { id: document.status },
    });
    if (!status) {
      throw new BadRequestException('invalid status');
    }

    // =========================
    // CATEGORY
    // =========================
    const category = await this.prisma.categories.findFirst({
      where: { slug: document.template },
    });
    if (!category) {
      throw new BadRequestException('invalid category');
    }

    // Variable untuk kebutuhan cleanup jika terjadi kegagalan
    let comicDir: string | null = null;

    try {
      // ================================================================
      // STEP 1: PRE-PROCESSING (FILE SYSTEM)
      // ================================================================
      const comicId = randomUUID();
      const legacyId = await this.getNextLegacyId(this.prisma);
      comicDir = path.join(STATIC_DIR, String(legacyId));

      await fs.mkdir(comicDir, { recursive: true });

      const coverFilename = `cover.webp`;
      let coverPath = `${STATIC_PREFIX}/default/cover.webp`;
      if (coverFile) {
        const coverSavePath = path.join(comicDir, coverFilename);
        const isGif =
          coverFile.mimetype === 'image/gif' ||
          coverFile.originalname?.toLowerCase().endsWith('.gif');

        try {
          await sharp
            .default(coverFile.buffer, isGif ? { animated: true } : {})
            .webp({ quality: 85 })
            .toFile(coverSavePath);

          coverPath = `${STATIC_PREFIX}/${legacyId}/${coverFilename}`;
        } catch (err) {
          throw new BadRequestException(
            'Gagal mengonversi cover ke format WebP',
          );
        }
      }

      const preparedChapters: any[] = [];

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

        const censorshipId = chapterData.censorship_id;
        if (!censorshipId) {
          throw new BadRequestException(
            `censorship_id is required for chapter ${chapterNumber}`,
          );
        }

        const normalizedPages = await this.normalizePages(chapterFiles);
        const pagesPayload = await this.prepareChapterPages(
          legacyId,
          chapterId,
          chapterNumber,
          normalizedPages,
        );

        preparedChapters.push({
          id: chapterId,
          chapter_number: chapterNumber,
          title: chapterData.title || null,
          language_code: chapterData.language,
          censorship_id: censorshipId,
          total_pages: chapterFiles.length,
          pagesPayload,
        });
      }

      // ================================================================
      // STEP 2: TRANSACTION (DATABASE)
      // ================================================================
      return await this.prisma.$transaction(
        async (tx) => {
          // CREATE COMIC
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

          // METADATA INSERTS
          const metadataTypes = [
            {
              data: metadata.parodies,
              entity: tx.tb_parodies,
              junction: tx.comic_parodies,
              field: 'parody_id',
            },
            {
              data: metadata.characters,
              entity: tx.tb_characters,
              junction: tx.comic_characters,
              field: 'character_id',
            },
            {
              data: metadata.artists,
              entity: tx.tb_artists,
              junction: tx.comic_artists,
              field: 'artist_id',
            },
            {
              data: metadata.authors,
              entity: tx.tb_authors,
              junction: tx.comic_authors,
              field: 'author_id',
            },
            {
              data: metadata.groups,
              entity: tx.tb_groups,
              junction: tx.comic_groups,
              field: 'group_id',
            },
            {
              data: metadata.tags,
              entity: tx.tb_tags,
              junction: tx.comic_tags,
              field: 'tag_id',
            },
          ];

          for (const meta of metadataTypes) {
            const uniqueItems = [...new Set(this.splitMetadata(meta.data))];
            for (const item of uniqueItems) {
              const record = await this.upsertEntity(meta.entity, item);
              await (meta.junction as any).create({
                data: {
                  comic_id: comicId,
                  [meta.field]: record.id,
                },
              });
            }
          }

          // INSERTS CHAPTERS & PAGES
          for (const ch of preparedChapters) {
            const isCensorshipExist = await tx.censorships.findUnique({
              where: { id: ch.censorship_id },
            });

            if (!isCensorshipExist) {
              throw new BadRequestException(
                `Censorship ID '${ch.censorship_id}' tidak ditemukan untuk chapter ${ch.chapter_number}`,
              );
            }

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

            await tx.pages.createMany({
              data: ch.pagesPayload,
            });
          }

          return {
            success: true,
            comic_id: comicId,
            legacy_id: String(legacyId),
          };
        },
        {
          timeout: 60000,
        },
      );
    } catch (error) {
      if (comicDir) {
        await fs
          .rm(comicDir, { recursive: true, force: true })
          .catch(() => null);
      }

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        error || 'Gagal mempublikasikan komik',
      );
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

  // API to get chapters by comic ID
  async getChaptersByComic(comicId: string) {
    const result = await this.prisma.$queryRawUnsafe(
      `
      SELECT fn_get_chapters_by_comic(
        $1::uuid
      ) AS data
      `,
      comicId,
    );

    return result?.[0]?.data ?? null;
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

  // API to get comic metadata by comic ID
  async getComicMetadata(comicId: string) {
    const result = await this.prisma.$queryRawUnsafe<
      Array<{
        fn_get_comic_metadata: any;
      }>
    >(
      `
      SELECT public.fn_get_comic_metadata(
        p_comic_id := $1::uuid
      )
      `,
      comicId,
    );

    if (!result.length) {
      return null;
    }

    return result[0].fn_get_comic_metadata;
  }
}
