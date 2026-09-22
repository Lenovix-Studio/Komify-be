import { ApiProperty } from '@nestjs/swagger';

export class CensorshipResponseDto {
  @ApiProperty({
    description: 'Unique identifier censorship (UUID)',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description: 'Nama status sensor (misal: Censored, Decensored, Uncensored)',
    example: 'Censored',
  })
  name!: string;

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
