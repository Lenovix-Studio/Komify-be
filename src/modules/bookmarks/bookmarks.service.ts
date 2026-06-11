import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class BookmarksService {
  constructor(private readonly prisma: PrismaService) {}

  async toggleBookmark(comicId: string) {
    const comic = await this.prisma.comics.findUnique({
      where: {
        id: comicId,
      },
    });

    if (!comic) {
      throw new NotFoundException('comic not found');
    }

    const bookmark = await this.prisma.bookmarks.findUnique({
      where: {
        comic_id: comicId,
      },
    });

    if (bookmark) {
      await this.prisma.bookmarks.delete({
        where: {
          comic_id: comicId,
        },
      });

      return {
        bookmarked: false,
      };
    }

    await this.prisma.bookmarks.create({
      data: {
        comic_id: comicId,
      },
    });

    return {
      bookmarked: true,
    };
  }

  async getBookmark(comicId: string) {
    const bookmark = await this.prisma.bookmarks.findUnique({
      where: {
        comic_id: comicId,
      },
    });

    return {
      bookmarked: !!bookmark,
    };
  }

  async getBookmarks() {
    return this.prisma.bookmarks.findMany({
      orderBy: {
        created_at: 'desc',
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
      },
    });
  }

  async deleteBookmark(comicId: string) {
    await this.prisma.bookmarks.delete({
      where: {
        comic_id: comicId,
      },
    });

    return {
      success: true,
    };
  }

  async clearBookmarks() {
    await this.prisma.bookmarks.deleteMany();

    return {
      success: true,
    };
  }
}
