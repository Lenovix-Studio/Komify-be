import * as cheerio from 'cheerio';
import { ExtractedMetadata } from './nhentai.extractor'; // Kita reuse interface-nya

export class ImhentaiExtractor {
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

    // =========================
    // TITLE & ALTERNATIVE TITLE
    // =========================
    result.title = $('.right_details h1').text().trim();
    result.alternative_title = $('.right_details .subtitle').text().trim();

    // =========================
    // TAGS MANAGEMENT
    // =========================
    $('.galleries_info li').each((_, element) => {
      const li = $(element);
      const rawLabel = li
        .find('.tags_text')
        .text()
        .trim()
        .replace(':', '')
        .toLowerCase();
      const values: string[] = [];

      li.find('a.tag').each((_, tagElement) => {
        const anchor = $(tagElement).clone();
        anchor.find('.badge').remove();

        const tagName = anchor.text().trim();
        if (tagName) {
          values.push(tagName);
        }
      });

      switch (rawLabel) {
        case 'parodies':
          result.parodies = values;
          break;

        case 'characters':
          result.characters = values;
          break;

        case 'tags':
          result.tags = values;
          break;

        case 'artists':
          result.artists = values;
          break;

        case 'groups':
          result.groups = values;
          break;
      }
    });

    return result;
  }
}
