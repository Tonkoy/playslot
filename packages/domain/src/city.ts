/**
 * City identity (QA-02). Clubs used to store the city as free text, so "Sofia"
 * and "София" became two cities and the default search found neither's clubs.
 * A city is identified by its slug: the transliterated, lower-cased name. Two
 * spellings of the same city produce the same slug and therefore one city row.
 */

/** Multi-letter Bulgarian → Latin first; the rest map one-to-one below. */
const DIGRAPHS: [RegExp, string][] = [
  [/щ/g, 'sht'],
  [/ж/g, 'zh'],
  [/ч/g, 'ch'],
  [/ш/g, 'sh'],
  [/ц/g, 'ts'],
  [/ю/g, 'yu'],
  [/я/g, 'ya'],
];

const LETTERS: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ъ: 'a', ь: 'y', ы: 'y', э: 'e',
};

/**
 * "София" → "sofia", "Sofia" → "sofia", " Велико  Търново " → "veliko-tarnovo".
 * Returns "" for a name with no usable characters — callers treat that as invalid.
 */
export function citySlug(name: string): string {
  let s = name.normalize('NFKC').toLowerCase().trim();
  // Official Bulgarian transliteration: a word-final "-ия" is "-ia", so
  // "София" is "sofia" (not "sofiya") and matches the Latin spelling.
  s = s.replace(/ия(?![\u0400-\u04FF])/g, 'ia');
  for (const [re, to] of DIGRAPHS) s = s.replace(re, to);
  s = s.replace(/[Ѐ-ӿ]/g, (ch) => LETTERS[ch] ?? '');
  // Latin accents (e.g. "Düsseldorf") reduce to their base letter.
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return s
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Trimmed display name, collapsed whitespace — what gets stored as `City.name`. */
export function cityDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}
