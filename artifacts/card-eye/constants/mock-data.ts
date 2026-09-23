export type CardRecord = {
  id: string;
  name: string;
  number: string;
  rarity: string;
  price: string;
  scannedAt: string;
  tone: 'blue' | 'violet' | 'orange' | 'green';
};

export const recentScans: CardRecord[] = [
  {
    id: 'charizard-sar',
    name: 'リザードンex',
    number: 'SV2a 201/165',
    rarity: 'SAR',
    price: '¥48,000',
    scannedAt: '今日 09:42',
    tone: 'orange',
  },
  {
    id: 'pikachu-ar',
    name: 'ピカチュウ',
    number: 'SV2a 173/165',
    rarity: 'AR',
    price: '¥12,800',
    scannedAt: '昨日 18:15',
    tone: 'blue',
  },
  {
    id: 'mew-ex-sar',
    name: 'ミュウex',
    number: 'SV2a 205/165',
    rarity: 'SAR',
    price: '¥22,500',
    scannedAt: '9月21日 14:06',
    tone: 'violet',
  },
  {
    id: 'venusaur-sar',
    name: 'フシギバナex',
    number: 'SV2a 200/165',
    rarity: 'SAR',
    price: '¥31,200',
    scannedAt: '9月19日 11:28',
    tone: 'green',
  },
];

export const collectionCards = recentScans.slice(0, 3);