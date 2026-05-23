import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class ComicsService {
  constructor(private readonly prisma: PrismaService) {}

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
