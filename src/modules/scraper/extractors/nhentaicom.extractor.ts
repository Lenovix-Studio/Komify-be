import * as cheerio from 'cheerio';
import { ExtractedMetadata } from './nhentai.extractor';

export class NhentaicomExtractor {
  extract(html: string): ExtractedMetadata {
    const $ = cheerio.load(html);
    const result: ExtractedMetadata = {
      title: '',
      alternative_title: '',
      parodies: [],
      characters: [],
      tags: [],
      artists: [],
      groups: [],
    };

    // ================================================================
    // TITLE & ALTERNATIVE TITLE
    // ================================================================
    result.title = $('.comic-card-details .comic-title').text().trim();
    result.alternative_title = $('.comic-card-details .comic-alternative-title')
      .text()
      .trim();

    // ================================================================
    // CARDS ITERATION (Tag, Karakter, Artis, Parodi, Hubungan, Grup)
    // ================================================================
    $('.details-card.box').each((_, element) => {
      const card = $(element);
      const headerClone = card.find('.box-header').clone();
      headerClone.find('svg').remove();
      const rawLabel = headerClone.text().trim().toLowerCase();
      const values: string[] = [];

      card.find('a.tag-link').each((_, tagElement) => {
        const anchor = $(tagElement).clone();
        anchor.find('svg').remove();

        const name = anchor.text().trim();
        if (name) {
          values.push(name);
        }
      });

      switch (rawLabel) {
        case 'parodi':
          result.parodies = values;
          break;

        case 'karakter':
          result.characters = values;
          break;

        case 'tag':
          result.tags = [...result.tags, ...values];
          break;

        case 'hubungan':
          result.tags = [...result.tags, ...values];
          break;

        case 'artis':
          result.artists = values;
          break;

        case 'grup':
          result.groups = values;
          break;
      }
    });

    return result;
  }
}
