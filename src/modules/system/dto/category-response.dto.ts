import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({
    description: 'Unique identifier kategori (UUID)',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description: 'Nama kategori komik',
    example: 'Manga',
  })
  name!: string;

  @ApiProperty({
    description: 'Slug URL-friendly kategori',
    example: 'manga',
  })
  slug!: string;

  @ApiProperty({
    description: 'Timestamp waktu dibuat',
    example: '2026-01-01T00:00:00.000Z',
  })
  created_at!: Date;

  @ApiProperty({
    description: 'Timestamp terakhir diperbarui',
    example: '2026-01-01T00:00:00.000Z',
  })
  updated_at!: Date;
}
