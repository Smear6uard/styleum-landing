/**
 * The demo wardrobe rendered inside the phone. Every item is a vector garment
 * (see components/Garments.astro) so the product demo never needs a screenshot.
 */
export type GarmentKind =
  | 'tee'
  | 'shirt'
  | 'knit'
  | 'blazer'
  | 'coat'
  | 'trousers'
  | 'jeans'
  | 'sneaker'
  | 'loafer';

export interface Item {
  id: string;
  kind: GarmentKind;
  name: string;
  category: 'Tops' | 'Layers' | 'Bottoms' | 'Shoes';
  color: string;
  material: string;
}

export const palette = {
  white: '#F1EFE8',
  ecru: '#E3DBC6',
  stone: '#C7BDA6',
  grey: '#A7A9AE',
  camel: '#B98B55',
  olive: '#5C6349',
  navy: '#22304D',
  indigo: '#3A4E76',
  charcoal: '#3B3D43',
  black: '#1B1C20',
  oxblood: '#6E2E2B',
} as const;

export const items: Item[] = [
  { id: 'tee-white', kind: 'tee', name: 'White tee', category: 'Tops', color: palette.white, material: 'Cotton' },
  { id: 'shirt-ecru', kind: 'shirt', name: 'Ecru shirt', category: 'Tops', color: palette.ecru, material: 'Poplin' },
  { id: 'knit-charcoal', kind: 'knit', name: 'Charcoal crew', category: 'Tops', color: palette.charcoal, material: 'Merino' },
  { id: 'shirt-navy', kind: 'shirt', name: 'Navy overshirt', category: 'Layers', color: palette.navy, material: 'Cotton twill' },
  { id: 'coat-camel', kind: 'coat', name: 'Camel coat', category: 'Layers', color: palette.camel, material: 'Wool' },
  { id: 'blazer-olive', kind: 'blazer', name: 'Olive blazer', category: 'Layers', color: palette.olive, material: 'Linen blend' },
  { id: 'jeans-indigo', kind: 'jeans', name: 'Indigo jeans', category: 'Bottoms', color: palette.indigo, material: 'Raw denim' },
  { id: 'trousers-black', kind: 'trousers', name: 'Black trousers', category: 'Bottoms', color: palette.black, material: 'Wool' },
  { id: 'trousers-stone', kind: 'trousers', name: 'Stone chinos', category: 'Bottoms', color: palette.stone, material: 'Cotton' },
  { id: 'sneaker-white', kind: 'sneaker', name: 'White sneakers', category: 'Shoes', color: palette.white, material: 'Leather' },
  { id: 'loafer-black', kind: 'loafer', name: 'Black loafers', category: 'Shoes', color: palette.black, material: 'Leather' },
  { id: 'loafer-oxblood', kind: 'loafer', name: 'Oxblood loafers', category: 'Shoes', color: palette.oxblood, material: 'Suede' },
  { id: 'tee-grey', kind: 'tee', name: 'Grey tee', category: 'Tops', color: palette.grey, material: 'Cotton' },
  { id: 'blazer-navy', kind: 'blazer', name: 'Navy blazer', category: 'Layers', color: palette.navy, material: 'Wool' },
  { id: 'trousers-charcoal', kind: 'trousers', name: 'Charcoal trousers', category: 'Bottoms', color: palette.charcoal, material: 'Flannel' },
];

const byId = Object.fromEntries(items.map((i) => [i.id, i])) as Record<string, Item>;

export interface Outfit {
  id: string;
  name: string;
  vibe: string;
  score: number;
  itemIds: [string, string, string, string];
}

export const todaysFour: Outfit[] = [
  { id: 'off-duty', name: 'Off-duty', vibe: 'Relaxed, clear skies', score: 94, itemIds: ['tee-white', 'shirt-navy', 'jeans-indigo', 'sneaker-white'] },
  { id: 'clean-lines', name: 'Clean lines', vibe: 'Sharp, all-day', score: 91, itemIds: ['knit-charcoal', 'coat-camel', 'trousers-black', 'loafer-black'] },
  { id: 'layered', name: 'Layered up', vibe: 'Soft tailoring', score: 89, itemIds: ['shirt-ecru', 'blazer-olive', 'trousers-stone', 'loafer-oxblood'] },
  { id: 'easy', name: 'Soft neutrals', vibe: 'Low effort, high polish', score: 86, itemIds: ['tee-grey', 'knit-charcoal', 'trousers-stone', 'sneaker-white'] },
];

export interface Occasion {
  id: string;
  label: string;
  title: string;
  note: string;
  itemIds: [string, string, string, string];
}

export const occasions: Occasion[] = [
  { id: 'date', label: 'Date night', title: 'Dinner at eight', note: 'Dark, soft, one good shoe.', itemIds: ['knit-charcoal', 'coat-camel', 'trousers-black', 'loafer-oxblood'] },
  { id: 'interview', label: 'Interview', title: 'Quietly sharp', note: 'Clean lines, nothing loud.', itemIds: ['shirt-ecru', 'blazer-navy', 'trousers-charcoal', 'loafer-black'] },
  { id: 'friday', label: 'Casual Friday', title: 'Easy Friday', note: 'Relaxed, still put together.', itemIds: ['tee-white', 'shirt-navy', 'trousers-stone', 'sneaker-white'] },
  { id: 'wedding', label: 'Wedding guest', title: 'Guest of honour', note: 'Warm tones for an afternoon.', itemIds: ['shirt-ecru', 'blazer-olive', 'trousers-stone', 'loafer-oxblood'] },
];

export const resolve = (ids: readonly string[]): Item[] => ids.map((id) => byId[id]);

export const weather = { temp: '68°', label: 'Clear', note: 'no coat needed' };
export const streakDays = 12;
