import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async recordHistory(dto: {
    comic_id: string;
    chapter_id: string;
    last_page?: number;
  }) {
    const comic = await this.prisma.comics.findUnique({
      where: { id: dto.comic_id },
    });
    if (!comic) {
      throw new NotFoundException('Comic not found');
    }

    const chapter = await this.prisma.chapters.findUnique({
      where: { id: dto.chapter_id },
    });
    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    const history = await this.prisma.read_histories.upsert({
      where: {
        comic_id: dto.comic_id,
      },
      update: {
        chapter_id: dto.chapter_id,
        last_page: dto.last_page ?? 1,
        updated_at: new Date(),
      },
      create: {
        comic_id: dto.comic_id,
        chapter_id: dto.chapter_id,
        last_page: dto.last_page ?? 1,
      },
    });

    return {
      success: true,
      data: history,
    };
  }

  async getHistories() {
    return this.prisma.read_histories.findMany({
      orderBy: {
        updated_at: 'desc',
      },
      include: {
        comics: {
          select: {
            id: true,
            title: true,
            seo_slug: true,
            cover_path: true,
            alternative_title: true,
            categories: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        chapters: {
          select: {
            id: true,
            chapter_number: true,
            title: true,
            total_pages: true,
          },
        },
      },
    });
  }

  async deleteHistory(comicId: string) {
    await this.prisma.read_histories.delete({
      where: {
        comic_id: comicId,
      },
    });

    return {
      success: true,
    };
  }

  async clearHistories() {
    await this.prisma.read_histories.deleteMany();

    return {
      success: true,
    };
  }
}
