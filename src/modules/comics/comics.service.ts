import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import slugify from 'slugify';
import { CreateChapterDto } from '../chapters/dto/create-chapter.dto';

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

  // CREATE CHAPTER
  private async saveChapterPage(
    legacyId: number | bigint,
    chapterNumber: string,
    file: Express.Multer.File,
  ) {
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
    await fs.mkdir(baseDir, {
      recursive: true,
    });

    const filename = file.originalname;
    const fullPath = path.join(baseDir, filename);
    await fs.writeFile(fullPath, file.buffer);
    return `${STATIC_PREFIX}/${legacyId}/chapters/${chapterNumber}/${filename}`;
  }
  async createChapter(
    comicId: string,
    dto: CreateChapterDto,
    files: Express.Multer.File[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Validate
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

      if (dto.pages?.length === 0) {
        throw new BadRequestException('chapter must contain at least 1 page');
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

      // Save pages
      for (const page of dto.pages) {
        const uploadedFile = files.find((f) => f.fieldname === page.temp_id);
        if (!uploadedFile) {
          throw new BadRequestException(
            `missing file for temp_id ${page.temp_id}`,
          );
        }

        const filepath = await this.saveChapterPage(
          comic.legacy_id,
          dto.chapter_number,
          uploadedFile,
        );
        await tx.pages.create({
          data: {
            chapter_id: chapter.id,
            page_number: page.page_number,
            filename: uploadedFile.originalname,
            filepath,
            filesize: BigInt(uploadedFile.size),
          },
        });
      }

      // Update total chapters in comic
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
    const status = await this.prisma.statuses.findFirst({
      where: {
        id: document.status_id,
      },
    });

    if (!status) {
      throw new BadRequestException('invalid status');
    }

    // =========================
    // VALIDATE CATEGORY
    // =========================
    const category = await this.prisma.categories.findFirst({
      where: {
        slug: document.template,
      },
    });

    if (!category) {
      throw new BadRequestException('invalid category');
    }

    // =========================
    // COVER
    // =========================
    const coverFile = files.find((f) => f.fieldname === 'cover');

    // =========================
    // DIRECTORY
    // =========================
    const comicDir = path.join(STATIC_DIR, String(existingComic.legacy_id));
    await fs.mkdir(comicDir, {
      recursive: true,
    });

    // =========================
    // COVER PATH
    // =========================
    let coverPath = existingComic.cover_path;

    // =========================
    // REPLACE COVER
    // =========================
    if (coverFile) {
      const coverExt = path.extname(coverFile.originalname || '') || '.jpg';
      const coverFilename = `cover${coverExt}`;
      const coverSavePath = path.join(comicDir, coverFilename);
      await fs.writeFile(coverSavePath, coverFile.buffer);
      coverPath = `${STATIC_PREFIX}/${existingComic.legacy_id}/${coverFilename}`;
    }

    // =========================
    // TRANSACTION
    // =========================
    return await this.prisma.$transaction(async (tx) => {
      // =========================
      // UPDATE COMIC
      // =========================
      await tx.comics.update({
        where: {
          id: comicId,
        },
        data: {
          title: document.metadata.title,
          alternative_title: document.metadata.alternative_title || null,
          description: document.metadata.description || null,
          category_id: category.id,
          status_id: document.metadata.status_id,
          cover_path: coverPath,
          updated_at: new Date(),
        },
      });

      // =========================
      // DELETE OLD RELATIONS
      // =========================
      await tx.comic_parodies.deleteMany({
        where: {
          comic_id: comicId,
        },
      });

      await tx.comic_characters.deleteMany({
        where: {
          comic_id: comicId,
        },
      });

      await tx.comic_artists.deleteMany({
        where: {
          comic_id: comicId,
        },
      });

      await tx.comic_authors.deleteMany({
        where: {
          comic_id: comicId,
        },
      });

      await tx.comic_groups.deleteMany({
        where: {
          comic_id: comicId,
        },
      });

      await tx.comic_tags.deleteMany({
        where: {
          comic_id: comicId,
        },
      });

      // =========================
      // METADATA
      // =========================
      const metadata = document.metadata;

      // =========================
      // PARODIES
      // =========================
      for (const item of this.splitMetadata(metadata.parodies)) {
        const parody = await this.upsertEntity(tx.tb_parodies, item);

        await tx.comic_parodies.create({
          data: {
            comic_id: comicId,
            parody_id: parody.id,
          },
        });
      }

      // =========================
      // CHARACTERS
      // =========================
      for (const item of this.splitMetadata(metadata.characters)) {
        const character = await this.upsertEntity(tx.tb_characters, item);

        await tx.comic_characters.create({
          data: {
            comic_id: comicId,
            character_id: character.id,
          },
        });
      }

      // =========================
      // ARTISTS
      // =========================
      for (const item of this.splitMetadata(metadata.artists)) {
        const artist = await this.upsertEntity(tx.tb_artists, item);

        await tx.comic_artists.create({
          data: {
            comic_id: comicId,
            artist_id: artist.id,
          },
        });
      }

      // =========================
      // AUTHORS
      // =========================
      for (const item of this.splitMetadata(metadata.authors)) {
        const author = await this.upsertEntity(tx.tb_authors, item);

        await tx.comic_authors.create({
          data: {
            comic_id: comicId,
            author_id: author.id,
          },
        });
      }

      // =========================
      // GROUPS
      // =========================
      for (const item of this.splitMetadata(metadata.groups)) {
        const group = await this.upsertEntity(tx.tb_groups, item);

        await tx.comic_groups.create({
          data: {
            comic_id: comicId,
            group_id: group.id,
          },
        });
      }

      // =========================
      // TAGS
      // =========================
      for (const item of this.splitMetadata(metadata.tags)) {
        const tag = await this.upsertEntity(tx.tb_tags, item);

        await tx.comic_tags.create({
          data: {
            comic_id: comicId,
            tag_id: tag.id,
          },
        });
      }

      return {
        success: true,
        comic_id: comicId,
      };
    });
  }

  // API to publish a new comic
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
    if (!coverFile) {
      throw new BadRequestException('cover is required');
    }

    // =========================
    // STATUS
    // =========================
    const status = await this.prisma.statuses.findFirst({
      where: {
        id: document.status,
      },
    });
    if (!status) {
      throw new BadRequestException('invalid status');
    }

    // =========================
    // CATEGORY
    // =========================
    const category = await this.prisma.categories.findFirst({
      where: {
        slug: document.template,
      },
    });
    if (!category) {
      throw new BadRequestException('invalid category');
    }

    // =========================
    // TRANSACTION
    // =========================
    return await this.prisma.$transaction(async (tx) => {
      // =========================
      // GENERATE ID
      // =========================
      const comicId = randomUUID();
      const legacyId = await this.getNextLegacyId(tx);

      // =========================
      // DIRECTORY
      // =========================
      const comicDir = path.join(STATIC_DIR, String(legacyId));
      await fs.mkdir(comicDir, {
        recursive: true,
      });

      // =========================
      // SAVE COVER
      // =========================
      const coverExt = path.extname(coverFile.originalname || '') || '.jpg';
      const coverFilename = `cover${coverExt}`;
      const coverSavePath = path.join(comicDir, coverFilename);
      await fs.writeFile(coverSavePath, coverFile.buffer);

      // =========================
      // CREATE COMIC
      // =========================
      await tx.comics.create({
        data: {
          id: comicId,
          legacy_id: BigInt(legacyId),
          title: document.metadata.title,
          alternative_title: document.metadata.alternative_title || null,
          description: document.metadata.description || null,
          category_id: category.id,
          status_id: status.id,
          cover_path: `${STATIC_PREFIX}/${legacyId}/${coverFilename}`,
          total_chapters: document.chapters.length,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      // =========================
      // METADATA
      // =========================
      const metadata = document.metadata;

      // =========================
      // PARODIES
      // =========================
      for (const item of this.splitMetadata(metadata.parodies)) {
        const parody = await this.upsertEntity(tx.tb_parodies, item);
        await tx.comic_parodies.create({
          data: {
            comic_id: comicId,
            parody_id: parody.id,
          },
        });
      }

      // =========================
      // CHARACTERS
      // =========================
      for (const item of this.splitMetadata(metadata.characters)) {
        const character = await this.upsertEntity(tx.tb_characters, item);
        await tx.comic_characters.create({
          data: {
            comic_id: comicId,
            character_id: character.id,
          },
        });
      }

      // =========================
      // ARTISTS
      // =========================
      for (const item of this.splitMetadata(metadata.artists)) {
        const artist = await this.upsertEntity(tx.tb_artists, item);
        await tx.comic_artists.create({
          data: {
            comic_id: comicId,
            artist_id: artist.id,
          },
        });
      }

      // =========================
      // AUTHORS
      // =========================
      for (const item of this.splitMetadata(metadata.authors)) {
        const author = await this.upsertEntity(tx.tb_authors, item);
        await tx.comic_authors.create({
          data: {
            comic_id: comicId,
            author_id: author.id,
          },
        });
      }

      // =========================
      // GROUPS
      // =========================
      for (const item of this.splitMetadata(metadata.groups)) {
        const group = await this.upsertEntity(tx.tb_groups, item);
        await tx.comic_groups.create({
          data: {
            comic_id: comicId,
            group_id: group.id,
          },
        });
      }

      // =========================
      // TAGS
      // =========================
      for (const item of this.splitMetadata(metadata.tags)) {
        const tag = await this.upsertEntity(tx.tb_tags, item);
        await tx.comic_tags.create({
          data: {
            comic_id: comicId,
            tag_id: tag.id,
          },
        });
      }

      // =========================
      // CHAPTERS
      // =========================
      for (const chapterData of document.chapters) {
        const chapterId = randomUUID();
        const mainPadded = String(chapterData.main).padStart(3, '0');
        const chapterNumber =
          Number(chapterData.sub) > 0
            ? `${mainPadded}.${chapterData.sub}`
            : mainPadded;

        // =========================
        // CHAPTER DIR
        // =========================
        const chapterDir = path.join(comicDir, 'chapters', chapterNumber);
        await fs.mkdir(chapterDir, {
          recursive: true,
        });

        // =========================
        // CHAPTER FILES
        // =========================
        const chapterFiles = files.filter(
          (f) => f.fieldname === `pages_${chapterData.id}`,
        );
        if (!chapterFiles.length) {
          throw new BadRequestException(
            `chapter ${chapterNumber} has no pages`,
          );
        }

        // =========================
        // CENSORSHIP
        // =========================
        const censorshipId = chapterData.censorship_id;
        if (!censorshipId) {
          throw new BadRequestException(
            `censorship_id is required for chapter ${chapterNumber}`,
          );
        }

        // =========================
        // CREATE CHAPTER
        // =========================
        await tx.chapters.create({
          data: {
            id: chapterId,
            comic_id: comicId,
            chapter_number: chapterNumber,
            title: chapterData.title || null,
            language_code: chapterData.language,
            censorship_id: censorshipId,
            total_pages: chapterFiles.length,
          },
        });

        // =========================
        // PAGES
        // =========================
        const pagesPayload: any[] = [];
        for (let i = 0; i < chapterFiles.length; i++) {
          const file = chapterFiles[i];
          const ext = path.extname(file.originalname || '') || '.jpg';
          const filename = `page${i + 1}${ext}`;
          const savePath = path.join(chapterDir, filename);
          await fs.writeFile(savePath, file.buffer);

          pagesPayload.push({
            chapter_id: chapterId,
            page_number: i + 1,
            filename,
            filepath: `${STATIC_PREFIX}/${legacyId}/chapters/${chapterNumber}/${filename}`,
            filesize: BigInt(file.size),
          });
        }

        // =========================
        // BULK INSERT PAGES
        // =========================
        await tx.pages.createMany({
          data: pagesPayload,
        });
      }

      return {
        success: true,
        comic_id: comicId,
        legacy_id: legacyId,
      };
    });
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
  async getHomepageComics(page = 1, limit = 10) {
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
