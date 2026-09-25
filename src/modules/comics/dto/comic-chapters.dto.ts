import { ApiProperty } from '@nestjs/swagger';

export class ChapterLanguageDto {
  @ApiProperty({ example: 'en' })
  code!: string;

  @ApiProperty({ example: 'English' })
  name!: string;
}

export class ChapterCensorshipDto {
  @ApiProperty({ example: 'c1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'Decensored' })
  name!: string;
}

export class ChapterPageDto {
  @ApiProperty({ example: 'p1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: '001.webp' })
  filename!: string;

  @ApiProperty({ example: '/comics/uuid/chapters/1/001.webp' })
  filepath!: string;

  @ApiProperty({ example: 1 })
  page_number!: number;
}

export class ComicChapterDto {
  @ApiProperty({ example: 'ch1b2c3d-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'Chapter 1: Romance Dawn' })
  title!: string;

  @ApiProperty({ example: '1' })
  chapter_number!: string;

  @ApiProperty({ example: 45 })
  total_pages!: number;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  published_at!: string;

  @ApiProperty({ type: () => ChapterLanguageDto })
  language!: ChapterLanguageDto;

  @ApiProperty({ type: () => ChapterCensorshipDto })
  censorship!: ChapterCensorshipDto;

  @ApiProperty({ type: () => [ChapterPageDto] })
  pages!: ChapterPageDto[];
}

export class ComicChaptersResponseDto {
  @ApiProperty({ type: () => [ComicChapterDto] })
  data!: ComicChapterDto[];

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  comic_id!: string;

  @ApiProperty({ example: 12 })
  total_chapters!: number;
}
