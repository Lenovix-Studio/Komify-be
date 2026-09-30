import { PrismaService } from '@/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
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
        translated_filepath: page.translated_filepath,
        is_translated: page.is_translated,
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
      try {
        await fs.mkdir(chapterDir, { recursive: true });
      } catch (err) {}

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
      let censorshipId = document.censorship_id;

      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          censorshipId,
        );
      if (isUuid) {
        const ccCensorship = await this.prisma.common_code_details.findUnique({
          where: { id: censorshipId },
        });

        if (ccCensorship) {
          let legacyCensorship = await this.prisma.censorships.findFirst({
            where: { name: { equals: ccCensorship.name, mode: 'insensitive' } },
          });
          if (!legacyCensorship) {
            legacyCensorship = await this.prisma.censorships.create({
              data: { name: ccCensorship.name },
            });
          }
          censorshipId = legacyCensorship.id;
        }
      }

      const censorship = await this.prisma.censorships.findUnique({
        where: {
          id: censorshipId,
        },
      });
      if (!censorship) {
        throw new BadRequestException('invalid censorship');
      }

      document.censorship_id = censorshipId;

      // =========================
      // VALIDATE LANGUAGE
      // =========================
      let language = await this.prisma.languages.findUnique({
        where: {
          code: document.language_code,
        },
      });
      if (!language) {
        const ccLanguage = await this.prisma.common_code_details.findFirst({
          where: {
            code: { equals: document.language_code, mode: 'insensitive' },
          },
        });
        if (ccLanguage) {
          language = await this.prisma.languages.create({
            data: {
              code: document.language_code.toLowerCase(),
              name: ccLanguage.name,
            },
          });
        } else {
          throw new BadRequestException('invalid language');
        }
      }

      return await this.prisma.$transaction(
        async (tx) => {
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
              } catch (error) {}
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
          const replacePages = document.pages.filter(
            (x) => x.action === 'replace',
          );

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
              const relativePath = existingPage.filepath.replace(
                STATIC_PREFIX,
                '',
              );
              const fullPath = path.join(STATIC_DIR, relativePath);
              await fs.access(fullPath);
              await fs.unlink(fullPath);
            } catch (error) {}

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
          const createPages = document.pages.filter(
            (x) => x.action === 'create',
          );
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
        },
        { maxWait: 10000, timeout: 120000 },
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        error || 'Gagal memperbarui chapter',
      );
    }
  }

  async translateChapter(chapterId: string) {
    const chapter = await this.prisma.chapters.findUnique({
      where: { id: chapterId },
      include: { pages: { orderBy: { page_number: 'asc' } } },
    });
    if (!chapter) throw new NotFoundException('Chapter not found');

    this.processTranslation(chapter).catch((err) => {
      console.error('Translation process failed for chapter', chapterId, err);
    });

    return {
      message: 'Translation queued successfully',
      chapterId: chapterId,
      pagesCount: chapter.pages.length,
    };
  }

  private async processTranslation(chapter: any) {
    console.log(
      `Started background translation for chapter ${chapter.chapter_number}`,
    );
    const TRANSLATOR_API = 'http://localhost:5003/translate/with-form/image';

    for (const page of chapter.pages) {
      try {
        console.log(`Translating page ${page.page_number}...`);
        const STATIC_DIR = this.configService.get('STATIC_DIR') || '';
        const STATIC_PREFIX = this.configService.get('STATIC_PREFIX') || '';

        let relativePath = page.filepath;
        if (STATIC_PREFIX && relativePath.startsWith(STATIC_PREFIX)) {
          relativePath = relativePath.slice(STATIC_PREFIX.length);
        }

        if (relativePath.startsWith('/')) {
          relativePath = relativePath.slice(1);
        }

        const imagePath = path.resolve(process.cwd(), STATIC_DIR, relativePath);
        const imageBuffer = await fs.readFile(imagePath);

        const formData = new FormData();
        const blob = new Blob([imageBuffer], { type: 'image/png' });
        formData.append('image', blob, page.filename);

        formData.append(
          'config',
          JSON.stringify({ translator: { target_lang: 'ENG' } }),
        );

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000);

        const response = await fetch(TRANSLATOR_API, {
          method: 'POST',
          body: formData,
          signal: controller.signal as any,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.error(
            `Failed to translate page ${page.page_number}, status: ${response.status}`,
          );
          continue;
        }

        const translatedBuffer = await response.arrayBuffer();

        const ext = path.extname(page.filename);
        const translatedFilename = page.filename.replace(
          ext,
          `_translated${ext}`,
        );
        const chapterDir = path.dirname(imagePath);
        const translatedPath = path.join(chapterDir, translatedFilename);

        await fs.writeFile(translatedPath, Buffer.from(translatedBuffer));

        const translatedDbPath = page.filepath.replace(
          page.filename,
          translatedFilename,
        );

        await this.prisma.pages.update({
          where: { id: page.id },
          data: {
            translated_filepath: translatedDbPath,
            is_translated: true,
          },
        });

        console.log(`Success translating page ${page.page_number}`);
      } catch (error) {
        console.error(`Error translating page ${page.page_number}:`, error);
      }
    }

    console.log(`Finished translation for chapter ${chapter.chapter_number}`);
  }
}
