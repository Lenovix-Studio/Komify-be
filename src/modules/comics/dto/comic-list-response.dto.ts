import { ApiProperty } from '@nestjs/swagger';

export class ComicStatusDto {
  @ApiProperty({
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    format: 'uuid',
  })
  id?: string;

  @ApiProperty({ example: 'Ongoing' })
  name?: string;
}

export class ComicCategoryDto {
  @ApiProperty({
    example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    format: 'uuid',
  })
  id?: string;

  @ApiProperty({ example: 'Manga' })
  name?: string;

  @ApiProperty({ example: 'manga' })
  slug?: string;
}

export class ComicItemDto {
  @ApiProperty({
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    format: 'uuid',
  })
  id?: string;

  @ApiProperty({ example: 12450, nullable: true, type: Number })
  legacy_id?: number | null;

  @ApiProperty({ example: 'One Piece' })
  title?: string;

  @ApiProperty({ example: 'Wan Pīsu', nullable: true })
  alternative_title?: string | null;

  @ApiProperty({ example: '/covers/one-piece.webp', nullable: true })
  cover_path?: string | null;

  @ApiProperty({ example: '1997-07-22T00:00:00.000Z', nullable: true })
  published_at?: Date | null;

  @ApiProperty({ example: 1100 })
  total_chapters?: number;

  @ApiProperty({ example: 345020, type: Number })
  view_count?: number;

  @ApiProperty({ type: () => ComicStatusDto, nullable: true })
  status?: ComicStatusDto | null;

  @ApiProperty({ type: () => ComicCategoryDto, nullable: true })
  category?: ComicCategoryDto | null;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page?: number;

  @ApiProperty({ example: 20 })
  limit?: number;

  @ApiProperty({ example: 142 })
  total_data?: number;

  @ApiProperty({ example: 8 })
  total_pages?: number;

  @ApiProperty({ example: false })
  has_prev?: boolean;

  @ApiProperty({ example: true })
  has_next?: boolean;
}

export class ComicPaginationResponseDto {
  @ApiProperty({ type: [ComicItemDto] })
  data?: ComicItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  pagination?: PaginationMetaDto;
}
