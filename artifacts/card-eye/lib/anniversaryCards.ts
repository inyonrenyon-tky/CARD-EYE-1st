export const anniversaryOfficialPage = 'https://www.30th.pokemon-card.com/product/m6a';

const officialImage = (file: string) => `https://www.30th.pokemon-card.com/images/m6a/cards/${file}.png`;

// Announcement examples, not catalog records. Keep their images on the official site.
export const anniversaryCards = [
  { id: 'anniversary-mew-ex-fur', name: 'ミュウex', detail: 'FURの描き下ろし', accent: 'lavender', image: officialImage('m6a_135_g2i0sfi4'), series: 'M6a', cardNumber: '135/103', rarity: 'FUR' },
  { id: 'anniversary-lugia', name: 'ルギア', detail: '歴史を彩る特別仕様', accent: 'mint', image: officialImage('m6a_142_a3jxu2i6'), series: 'M6a', cardNumber: '142/103', rarity: '' },
  { id: 'anniversary-pikachu-ex', name: 'ピカチュウex', detail: '一日を描くイラスト', accent: 'softYellow', image: officialImage('m6a_127_ji4tzv00'), series: 'M6a', cardNumber: '127/103', rarity: 'SAR' },
] as const;