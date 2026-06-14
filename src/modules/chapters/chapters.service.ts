import { PrismaService } from '@/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as sharp from 'sharp';

@Injectable()
export class ChaptersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // Delete a chapter and its pages, also delete chapter folder and files
  async deleteChapter(chapterId: string) {
    const chapter = await this.prisma.chapters.findUnique({
      where: {
        id: chapterId,
      },
      include: {
        comics: {
          select: {
            id: true,
            title: true,
            legacy_id: true,
          },
        },
        pages: {
          select: {
            id: true,
          },
        },
      },
    });
    if (!chapter) {
      throw new NotFoundException('chapter not found');
    }

    const staticDir =
      this.configService.get<string>('STATIC_DIR') || process.env.STATIC_DIR;
    const chapterFolder = path.join(
      staticDir ?? 'unknown',
      String(chapter.comics.legacy_id),
      'chapters',
      chapter.chapter_number,
    );
    const totalPages = chapter.pages.length;

    try {
      await fs.rm(chapterFolder, {
        recursive: true,
        force: true,
      });
    } catch (error) {
      console.error('failed delete chapter folder', error);
    }

    await this.prisma.chapters.delete({
      where: {
        id: chapterId,
      },
    });

    const totalChapters = await this.prisma.chapters.count({
      where: {
        comic_id: chapter.comic_id,
        deleted_at: null,
      },
    });

    await this.prisma.comics.update({
      where: {
        id: chapter.comic_id,
      },
      data: {
        total_chapters: totalChapters,
      },
    });

    return {
      success: true,
      deleted_chapter_id: chapterId,
      comic: {
        id: chapter.comics.id,
        title: chapter.comics.title,
        legacy_id: Number(chapter.comics.legacy_id),
      },
      deleted_pages: totalPages,
      deleted_folder: chapterFolder,
    };
  }

  // Get chapter details
  async getChapter(chapterId: string) {
    const chapter = await this.prisma.chapters.findUnique({
      where: {
        id: chapterId,
      },
      include: {
        pages: {
          orderBy: {
            page_number: 'asc',
          },
        },
        comics: {
          select: {
            id: true,
            title: true,
            legacy_id: true,
          },
        },
        languages: true,
        censorships: true,
      },
    });

    if (!chapter) {
      throw new NotFoundException('chapter not found');
    }

    return {
      id: chapter.id,
      comic: {
        id: chapter.comics.id,
        title: chapter.comics.title,
        legacy_id: Number(chapter.comics.legacy_id),
      },
      title: chapter.title,
      chapter_number: chapter.chapter_number,
      total_pages: chapter.total_pages,
      published_at: chapter.published_at,
      language: {
        code: chapter.languages.code,
        name: chapter.languages.name,
      },
      censorship: {
        id: chapter.censorships.id,
        name: chapter.censorships.name,
      },
      pages: chapter.pages.map((page) => ({
        id: page.id,
        filename: page.filename,
        filepath: page.filepath,
        page_number: page.page_number,
        width: page.width,
        height: page.height,
        filesize: page.filesize ? Number(page.filesize) : null,
      })),
    };
  }

  // Edit a chapter
  async editChapter(
    chapterId: string,
    files: Array<Express.Multer.File>,
    body: any,
  ) {
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
    // FIND CHAPTER
    // =========================
    const chapter = await this.prisma.chapters.findUnique({
      where: {
        id: chapterId,
      },
      include: {
        comics: true,
        pages: {
          orderBy: {
            page_number: 'asc',
          },
        },
      },
    });
    if (!chapter) {
      throw new NotFoundException('chapter not found');
    }

    // =========================
    // PAGE PREPARATION
    // =========================
    const comicLegacyId = chapter.comics.legacy_id.toString();
    const chapterDir = path.join(
      STATIC_DIR,
      comicLegacyId,
      'chapters',
      chapter.chapter_number,
    );
    await fs.mkdir(chapterDir, {
      recursive: true,
    });

    // =========================
    // VALIDATE PAGE NUMBER
    // =========================
    const pageNumbers = document.pages.map((x) => x.page_number);
    const duplicatePageNumbers = pageNumbers.filter(
      (item, index) => pageNumbers.indexOf(item) !== index,
    );
    if (duplicatePageNumbers.length > 0) {
      throw new BadRequestException(
        `duplicate page_number detected: ${duplicatePageNumbers.join(', ')}`,
      );
    }

    // =========================
    // VALIDATE CENSORSHIP
    // =========================
    const censorship = await this.prisma.censorships.findUnique({
      where: {
        id: document.censorship_id,
      },
    });
    if (!censorship) {
      throw new BadRequestException('invalid censorship');
    }

    // =========================
    // VALIDATE LANGUAGE
    // =========================
    const language = await this.prisma.languages.findUnique({
      where: {
        code: document.language_code,
      },
    });
    if (!language) {
      throw new BadRequestException('invalid language');
    }

    return await this.prisma.$transaction(async (tx) => {
      // =========================
      // UPDATE CHAPTER
      // =========================
      await tx.chapters.update({
        where: {
          id: chapterId,
        },
        data: {
          title: document.title || null,
          censorship_id: document.censorship_id,
          language_code: document.language_code,
        },
      });

      // =========================
      // DELETE PAGES
      // =========================
      if (
        Array.isArray(document.deleted_pages) &&
        document.deleted_pages.length > 0
      ) {
        const pagesToDelete = await tx.pages.findMany({
          where: {
            id: {
              in: document.deleted_pages,
            },
          },
        });
        for (const page of pagesToDelete) {
          try {
            const relativePath = page.filepath.replace(STATIC_PREFIX, '');
            const fullPath = path.join(STATIC_DIR, relativePath);
            await fs.access(fullPath);
            await fs.unlink(fullPath);
          } catch (error) {
            console.error(error);
          }
        }
        await tx.pages.deleteMany({
          where: {
            id: {
              in: document.deleted_pages,
            },
          },
        });
      }

      const existingPages = document.pages.filter(
        (x) => x.id && (x.action === 'keep' || x.action === 'replace'),
      );
      for (const page of existingPages) {
        await tx.pages.update({
          where: {
            id: page.id,
          },
          data: {
            page_number: page.page_number + 10000,
          },
        });
      }

      // =========================
      // KEEP PAGES
      // =========================
      const keepPages = document.pages.filter((x) => x.action === 'keep');
      for (const page of keepPages) {
        await tx.pages.update({
          where: {
            id: page.id,
          },
          data: {
            page_number: page.page_number,
          },
        });
      }

      // ================================================================
      // UPDATED: REPLACE PAGES (CONVERT TO WEBP)
      // ================================================================
      const replacePages = document.pages.filter((x) => x.action === 'replace');

      for (const page of replacePages) {
        const existingPage = await tx.pages.findUnique({
          where: {
            id: page.id,
          },
        });
        if (!existingPage) {
          throw new BadRequestException(`page not found: ${page.id}`);
        }

        const uploadedFile = files.find(
          (f) => f.fieldname === `files_${page.temp_id}`,
        );
        if (!uploadedFile) {
          throw new BadRequestException(
            `replacement file missing for temp_id ${page.temp_id}`,
          );
        }

        try {
          const relativePath = existingPage.filepath.replace(STATIC_PREFIX, '');
          const fullPath = path.join(STATIC_DIR, relativePath);
          await fs.access(fullPath);
          await fs.unlink(fullPath);
        } catch (error) {
          console.error(error);
        }

        const filename = `page${page.page_number}.webp`;
        const savePath = path.join(chapterDir, filename);
        const isGif =
          uploadedFile.mimetype === 'image/gif' ||
          uploadedFile.originalname?.toLowerCase().endsWith('.gif');
        let webpInfo: sharp.OutputInfo;
        try {
          webpInfo = await sharp
            .default(uploadedFile.buffer, isGif ? { animated: true } : {})
            .webp({ quality: 80 })
            .toFile(savePath);
        } catch (err) {
          throw new BadRequestException(
            `Gagal mengonversi file pengganti halaman ${page.page_number} ke WebP`,
          );
        }

        await tx.pages.update({
          where: {
            id: page.id,
          },
          data: {
            page_number: page.page_number,
            filename,
            filepath:
              `${STATIC_PREFIX}/${comicLegacyId}` +
              `/chapters/${chapter.chapter_number}/${filename}`,
            filesize: BigInt(webpInfo.size),
          },
        });
      }

      // ================================================================
      // UPDATED: CREATE NEW PAGES (CONVERT TO WEBP)
      // ================================================================
      const createPages = document.pages.filter((x) => x.action === 'create');
      for (const page of createPages) {
        const uploadedFile = files.find(
          (f) => f.fieldname === `files_${page.temp_id}`,
        );

        if (!uploadedFile) {
          throw new BadRequestException(
            `file missing for temp_id ${page.temp_id}`,
          );
        }

        const filename = `page${page.page_number}.webp`;
        const savePath = path.join(chapterDir, filename);
        const isGif =
          uploadedFile.mimetype === 'image/gif' ||
          uploadedFile.originalname?.toLowerCase().endsWith('.gif');
        let webpInfo: sharp.OutputInfo;
        try {
          webpInfo = await sharp
            .default(uploadedFile.buffer, isGif ? { animated: true } : {})
            .webp({ quality: 80 })
            .toFile(savePath);
        } catch (err) {
          throw new BadRequestException(
            `Gagal mengonversi halaman baru ${page.page_number} ke WebP`,
          );
        }

        await tx.pages.create({
          data: {
            chapter_id: chapterId,
            page_number: page.page_number,
            filename,
            filepath:
              `${STATIC_PREFIX}/${comicLegacyId}` +
              `/chapters/${chapter.chapter_number}/${filename}`,
            filesize: BigInt(webpInfo.size),
          },
        });
      }

      // =========================
      // RECALCULATE TOTAL PAGES
      // =========================
      const totalPages = await tx.pages.count({
        where: {
          chapter_id: chapterId,
        },
      });

      await tx.chapters.update({
        where: {
          id: chapterId,
        },
        data: {
          total_pages: totalPages,
        },
      });

      return {
        success: true,
        chapter_id: chapterId,
        total_pages: totalPages,
      };
    });
  }
}
