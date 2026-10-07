export type Unit = '個' | '本' | 'パック';

export type Profile = 'morning' | 'lunch' | 'lunchEvening' | 'evening' | 'allday' | 'commute';

export interface Item {
  sku: string;
  name: string;
  category: string;
  price: number;
  shelfLifeHours: number;
  orderCutoff: string;
  leadTimeDays: number;
  minLot: number;
  /** 数える単位（個・本・パック）。グラフ・表・発注の数量に必ず添える */
  unit: Unit;
  /** 平日・平常天気での 1 日の平均需要 */
  base: number;
  profile: Profile;
  /** 雨の日の需要倍率 */
  rain: number;
  /** 最高気温 25℃ 以上の日の需要倍率 */
  hot: number;
  /** 最高気温 16℃ 以下の日の需要倍率 */
  cold: number;
  /** 近くのイベント日の夕方（15〜20 時）の需要倍率 */
  event: number;
  /** 販売開始日（おでんなど季節品） */
  since?: string;
  /** 店内調理（冷凍の仕込み在庫から都度調理。売り切れにはならず、調理後の時間超過で廃棄が出る） */
  cooked: boolean;
}

/** カテゴリごとの単位。違う品目は item() の m.unit で上書きする */
const UNIT_BY_CATEGORY: Record<string, Unit> = { 飲料: '本', 日用品: '本', サラダ: 'パック' };

const FRESH_CUTOFF = '10:00';
const GROCERY_CUTOFF = '11:00';

function item(
  sku: string,
  name: string,
  category: string,
  price: number,
  shelfLifeHours: number,
  leadTimeDays: number,
  minLot: number,
  base: number,
  profile: Profile,
  m: Partial<Pick<Item, 'rain' | 'hot' | 'cold' | 'event' | 'since' | 'unit'>> = {},
): Item {
  return {
    sku,
    name,
    category,
    price,
    shelfLifeHours,
    orderCutoff: leadTimeDays === 0 ? FRESH_CUTOFF : GROCERY_CUTOFF,
    leadTimeDays,
    minLot,
    unit: m.unit ?? UNIT_BY_CATEGORY[category] ?? '個',
    base,
    profile,
    rain: m.rain ?? 1,
    hot: m.hot ?? 1,
    cold: m.cold ?? 1,
    event: m.event ?? 1,
    since: m.since,
    cooked: category === 'おでん' || category === 'ホットスナック',
  };
}

/** 架空店舗で扱う 50 品目。名称に実在チェーンの商品名は使わない。 */
export const ITEMS: Item[] = [
  item('O01', '鮭おにぎり', 'おにぎり', 160, 24, 0, 2, 22, 'morning', { event: 1.9, rain: 0.95 }),
  item('O02', 'ツナマヨおにぎり', 'おにぎり', 150, 24, 0, 2, 24, 'morning', { event: 1.9, rain: 0.95 }),
  item('O03', '梅おにぎり', 'おにぎり', 140, 24, 0, 2, 10, 'morning', { event: 1.8 }),
  item('O04', '昆布おにぎり', 'おにぎり', 140, 24, 0, 2, 8, 'morning', { event: 1.8 }),
  item('O05', '明太子おにぎり', 'おにぎり', 170, 24, 0, 2, 14, 'morning', { event: 1.9 }),
  item('O06', '焼たらこおにぎり', 'おにぎり', 170, 24, 0, 2, 9, 'morning', { event: 1.8 }),
  item('O07', '鶏五目おにぎり', 'おにぎり', 160, 24, 0, 2, 9, 'morning', { event: 1.8 }),
  item('O08', '赤飯おにぎり', 'おにぎり', 150, 24, 0, 2, 6, 'morning', { event: 1.6 }),

  item('B01', '特製から揚げ弁当', '弁当', 598, 24, 0, 1, 17, 'lunchEvening', { event: 1.3 }),
  item('B02', '幕の内弁当', '弁当', 650, 24, 0, 1, 8, 'lunch'),
  item('B03', 'のり弁当', '弁当', 450, 24, 0, 1, 10, 'lunch'),
  item('B04', 'ハンバーグ弁当', '弁当', 598, 24, 0, 1, 9, 'lunchEvening'),
  item('B05', '生姜焼き弁当', '弁当', 580, 24, 0, 1, 7, 'lunchEvening'),
  item('B06', 'オムライス', '弁当', 550, 24, 0, 1, 6, 'lunch'),

  item('N01', '冷し中華', '麺', 520, 30, 0, 1, 6, 'lunch', { hot: 2.0, rain: 0.55, cold: 0.35 }),
  item('N02', 'ざるそば', '麺', 450, 30, 0, 1, 7, 'lunch', { hot: 1.6, rain: 0.65, cold: 0.55 }),
  item('N03', 'カップ麺 しょうゆ', '麺', 220, 4320, 1, 3, 9, 'allday', { rain: 1.6, cold: 1.4, hot: 0.8 }),
  item('N04', 'カップ麺 みそ', '麺', 230, 4320, 1, 3, 6, 'allday', { rain: 1.6, cold: 1.5, hot: 0.75 }),
  item('N05', 'カップ焼そば', '麺', 220, 4320, 1, 3, 6, 'allday', { rain: 1.5, cold: 1.2 }),
  item('N06', '温かい肉うどん', '麺', 480, 30, 0, 1, 5, 'lunchEvening', { cold: 1.6, rain: 1.3, hot: 0.5 }),

  item('P01', 'メロンパン', 'パン', 150, 72, 1, 2, 10, 'morning'),
  item('P02', 'たまごサンド', 'パン', 320, 30, 0, 2, 12, 'morning'),
  item('P03', 'ミックスサンド', 'パン', 350, 30, 0, 2, 8, 'morning'),
  item('P04', 'あんぱん', 'パン', 140, 72, 1, 2, 6, 'morning'),
  item('P05', 'カレーパン', 'パン', 180, 48, 0, 2, 7, 'lunch'),

  item('D01', 'プレミアムロールケーキ', 'デザート', 200, 48, 0, 1, 10, 'evening'),
  item('D02', 'マンゴー杏仁', 'デザート', 280, 48, 0, 1, 8, 'evening', { hot: 1.4, cold: 0.7 }),
  item('D03', 'なめらかプリン', 'デザート', 180, 48, 0, 1, 7, 'evening'),
  item('D04', 'わらびもち', 'デザート', 230, 48, 0, 1, 4, 'evening', { hot: 1.5, cold: 0.6 }),
  item('D05', '栗のモンブラン', 'デザート', 330, 48, 0, 1, 5, 'evening', { cold: 1.3 }),

  item('E01', 'おでん 大根', 'おでん', 100, 12, 0, 5, 14, 'evening', { cold: 1.6, rain: 1.5, hot: 0.3, event: 1.3, since: '2026-09-15' }),
  item('E02', 'おでん たまご', 'おでん', 100, 12, 0, 5, 12, 'evening', { cold: 1.6, rain: 1.5, hot: 0.3, event: 1.3, since: '2026-09-15' }),
  item('E03', 'おでん 牛すじ', 'おでん', 140, 12, 0, 5, 8, 'evening', { cold: 1.6, rain: 1.5, hot: 0.3, event: 1.3, since: '2026-09-15' }),
  item('E04', 'おでん ちくわぶ', 'おでん', 100, 12, 0, 5, 5, 'evening', { cold: 1.5, rain: 1.4, hot: 0.3, since: '2026-09-15' }),
  item('E05', 'おでん しらたき', 'おでん', 100, 12, 0, 5, 5, 'evening', { cold: 1.5, rain: 1.4, hot: 0.3, since: '2026-09-15' }),

  item('K01', 'お茶 500ml', '飲料', 150, 8760, 0, 6, 30, 'commute', { hot: 1.5, rain: 0.85, event: 1.9 }),
  item('K02', 'ミネラルウォーター 500ml', '飲料', 110, 8760, 0, 6, 22, 'commute', { hot: 1.6, rain: 0.85, event: 1.9 }),
  item('K03', 'スポーツドリンク 500ml', '飲料', 160, 8760, 0, 6, 12, 'commute', { hot: 2.0, cold: 0.6, event: 1.7 }),
  item('K04', 'ホットコーヒー（缶）', '飲料', 140, 8760, 0, 6, 12, 'morning', { cold: 1.5, rain: 1.2, hot: 0.6 }),
  item('K05', 'カフェラテ（チルド）', '飲料', 160, 336, 0, 6, 14, 'morning'),
  item('K06', '炭酸飲料 500ml', '飲料', 170, 8760, 0, 6, 10, 'commute', { hot: 1.5, event: 1.7 }),
  item('K07', 'ホットレモン', '飲料', 150, 8760, 0, 6, 4, 'evening', { cold: 2.0, rain: 1.3, hot: 0.2 }),

  item('I01', 'バニラアイスバー', 'アイス', 150, 8760, 1, 6, 10, 'allday', { hot: 1.8, rain: 0.5, cold: 0.4, unit: '本' }),
  item('I02', 'かき氷カップ', 'アイス', 200, 8760, 1, 6, 5, 'allday', { hot: 2.5, rain: 0.45, cold: 0.2 }),

  item('S01', 'グリーンサラダ', 'サラダ', 300, 30, 0, 1, 6, 'lunch', { hot: 1.2 }),
  item('S02', 'ポテトサラダ', 'サラダ', 250, 30, 0, 1, 5, 'lunchEvening'),

  item('U01', 'ビニール傘 65cm', '日用品', 650, 87600, 0, 1, 0.5, 'commute', { rain: 16 }),

  item('H01', '骨なしフライドチキン', 'ホットスナック', 220, 4, 0, 10, 12, 'lunchEvening', { event: 1.8, cold: 1.1 }),
  item('H02', 'からあげ 5 個入り', 'ホットスナック', 240, 4, 0, 10, 10, 'lunchEvening', { event: 1.8, unit: 'パック' }),
  item('H03', 'アメリカンドッグ', 'ホットスナック', 140, 4, 0, 10, 6, 'allday', { event: 1.4 }),
];

export const CATEGORIES = [...new Set(ITEMS.map((i) => i.category))];

const BY_SKU = new Map(ITEMS.map((i) => [i.sku, i]));

export function findItem(sku: string): Item | undefined {
  return BY_SKU.get(sku.trim().toUpperCase());
}

/** 1 日で売り切る前提の品目（売れ残りはその日のうちに廃棄） */
export function isDailyFresh(i: Item): boolean {
  return i.shelfLifeHours <= 48 && !i.cooked;
}

const PROFILES: Record<Profile, number[]> = {
  //          0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16   17   18   19   20   21   22   23
  morning: [0.4, 0.2, 0.1, 0.1, 0.2, 0.6, 2.5, 6.0, 7.0, 3.5, 2.0, 3.5, 5.0, 3.0, 1.5, 1.5, 2.0, 2.5, 3.0, 2.5, 1.5, 1.0, 0.7, 0.5],
  lunch: [0.2, 0.1, 0.0, 0.0, 0.0, 0.1, 0.3, 0.8, 1.0, 1.0, 2.0, 7.0, 9.0, 4.0, 1.5, 1.0, 1.0, 1.5, 2.0, 1.5, 1.0, 0.6, 0.4, 0.3],
  lunchEvening: [0.2, 0.1, 0.0, 0.0, 0.0, 0.1, 0.2, 0.5, 0.6, 0.6, 1.2, 4.5, 6.0, 2.5, 1.0, 1.0, 1.5, 3.5, 5.5, 5.5, 3.5, 1.8, 0.8, 0.4],
  evening: [0.5, 0.3, 0.1, 0.0, 0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 1.0, 1.5, 1.2, 1.0, 1.2, 2.0, 3.5, 5.0, 5.5, 4.5, 3.0, 1.8, 1.0],
  allday: [0.8, 0.5, 0.3, 0.2, 0.2, 0.3, 0.8, 1.5, 2.0, 2.0, 2.2, 3.0, 3.5, 2.8, 2.2, 2.2, 2.5, 3.0, 3.2, 3.0, 2.5, 2.0, 1.5, 1.2],
  commute: [0.4, 0.2, 0.1, 0.1, 0.1, 0.3, 1.5, 4.0, 4.5, 2.5, 2.0, 3.0, 4.0, 3.0, 2.2, 2.2, 2.8, 4.0, 4.5, 3.5, 2.2, 1.5, 1.0, 0.6],
};

const NORMALIZED: Record<Profile, number[]> = Object.fromEntries(
  Object.entries(PROFILES).map(([k, v]) => {
    const sum = v.reduce((a, b) => a + b, 0);
    return [k, v.map((x) => x / sum)];
  }),
) as Record<Profile, number[]>;

export function hourShare(p: Profile, hour: number): number {
  return NORMALIZED[p][hour];
}

export const EVENT_HOURS = [15, 16, 17, 18, 19, 20];
