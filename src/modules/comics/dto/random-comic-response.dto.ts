import { ApiProperty } from '@nestjs/swagger';

export class RandomComicResponseDto {
  @ApiProperty({
    description: 'Unique identifier komik (UUID)',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    format: 'uuid',
  })
  id?: string;

  @ApiProperty({
    description: 'Judul komik',
    example: 'One Piece',
  })
  title?: string;

  @ApiProperty({
    description: 'SEO slug komik untuk URL routing',
    example: 'one-piece',
    nullable: true,
  })
  seo_slug?: string | null;

  @ApiProperty({
    description: 'Path/URL cover komik',
    example: '/covers/one-piece.webp',
    nullable: true,
  })
  cover_path?: string | null;

  @ApiProperty({
    description: 'Jumlah total chapter yang tersedia',
    example: 1100,
  })
  total_chapters?: number;
}
