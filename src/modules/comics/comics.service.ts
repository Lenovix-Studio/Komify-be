import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import slugify from 'slugify';

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
      fs.mkdirSync(comicDir, {
        recursive: true,
      });

      // =========================
      // SAVE COVER
      // =========================
      const coverExt = path.extname(coverFile.originalname || '') || '.jpg';
      const coverFilename = `cover${coverExt}`;
      const coverSavePath = path.join(comicDir, coverFilename);
      fs.writeFileSync(coverSavePath, coverFile.buffer);

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
        fs.mkdirSync(chapterDir, {
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
          fs.writeFileSync(savePath, file.buffer);

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
