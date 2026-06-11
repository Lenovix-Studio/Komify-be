import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { BookmarksService } from './bookmarks.service';

@Controller('bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  // POST /bookmarks/:comicId
  @Post(':comicId')
  async toggleBookmark(@Param('comicId') comicId: string) {
    return this.bookmarksService.toggleBookmark(comicId);
  }

  // GET /bookmarks/:comicId
  @Get(':comicId')
  async getBookmark(@Param('comicId') comicId: string) {
    return this.bookmarksService.getBookmark(comicId);
  }

  // GET /bookmarks
  @Get()
  async getBookmarks() {
    return this.bookmarksService.getBookmarks();
  }

  // DELETE /bookmarks/:comicId
  @Delete(':comicId')
  async deleteBookmark(@Param('comicId') comicId: string) {
    return this.bookmarksService.deleteBookmark(comicId);
  }

  // DELETE /bookmarks
  @Delete()
  async clearBookmarks() {
    return this.bookmarksService.clearBookmarks();
  }
}
