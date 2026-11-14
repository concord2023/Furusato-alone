// tax-tables.js — 年別の税率・控除テーブル。
//
// 以前は app.js の計算関数の中に年ごとの金額が直接埋め込まれていた。
// 制度改正があったら、このファイルに「施行年」のエントリを追加するだけでよい。
//
// tableForYear(table, year) の決まり (従来の app.js 内の分岐と同じ挙動):
// - 指定年以下の最大のキー (施行年) のテーブルを使う。
// - 指定年より前のキーしか無い場合は、最も古いキーのテーブルを使う。
//   例: 2023年 → 2024年テーブル、2027年 → 2026年テーブル (現行仕様どおり、
//   未定義の将来年は最新の制度で計算される)。
(function (root) {
  'use strict';

  function tableForYear(table, year) {
    const years = Object.keys(table).map(Number).sort((a, b) => a - b);
    let chosen = years[0];
    for (const y of years) { if (year >= y) chosen = y; }
    return table[chosen];
  }

  const FurusatoTaxTables = {
    tableForYear,

    // 給与所得控除: bands は [上限, 率, 加算額]。rate が null の帯は amount の定額。
    SALARY_DEDUCTION: {
      2024: [
        { limit: 1625000, rate: null, amount: 550000 },
        { limit: 1800000, rate: 0.4, add: -100000 },
        { limit: 3600000, rate: 0.3, add: 80000 },
        { limit: 6600000, rate: 0.2, add: 440000 },
        { limit: 8500000, rate: 0.1, add: 1100000 },
        { limit: null, rate: null, amount: 1950000 }
      ],
      2025: [
        { limit: 1900000, rate: null, amount: 650000 },
        { limit: 3600000, rate: 0.3, add: 80000 },
        { limit: 6600000, rate: 0.2, add: 440000 },
        { limit: 8500000, rate: 0.1, add: 1100000 },
        { limit: null, rate: null, amount: 1950000 }
      ],
      2026: [
        { limit: 2200000, rate: null, amount: 740000 },
        { limit: 3600000, rate: 0.3, add: 80000 },
        { limit: 6600000, rate: 0.2, add: 440000 },
        { limit: 8500000, rate: 0.1, add: 1100000 },
        { limit: null, rate: null, amount: 1950000 }
      ]
    },

    // 基礎控除 (所得税): bands は [合計所得の上限, 控除額]。どの帯にも入らなければ 0。
    BASIC_DEDUCTION: {
      2024: [
        { limit: 23500000, amount: 480000 },
        { limit: 24000000, amount: 320000 },
        { limit: 24500000, amount: 160000 }
      ],
      2025: [
        { limit: 1320000, amount: 950000 },
        { limit: 3360000, amount: 880000 },
        { limit: 4890000, amount: 680000 },
        { limit: 6550000, amount: 630000 },
        { limit: 23500000, amount: 580000 },
        { limit: 24000000, amount: 480000 },
        { limit: 24500000, amount: 320000 },
        { limit: 25000000, amount: 160000 }
      ],
      2026: [
        { limit: 1320000, amount: 1040000 },
        { limit: 3360000, amount: 880000 },
        { limit: 4890000, amount: 680000 },
        { limit: 6550000, amount: 670000 },
        { limit: 23500000, amount: 620000 },
        { limit: 24000000, amount: 480000 },
        { limit: 24500000, amount: 320000 },
        { limit: 25000000, amount: 160000 }
      ]
    },

    // 扶養親族の所得要件 (合計所得金額の上限)
    DEPENDENT_INCOME_LIMIT: { 2024: 480000, 2025: 580000, 2026: 620000 },

    // 扶養控除の金額 (1人あたり)
    DEPENDENT_AMOUNTS: {
      incomeTax: { general: 380000, specific: 630000, elderly: 480000, elderlyCohabiting: 580000 },
      resident: { general: 330000, specific: 450000, elderly: 380000, elderlyCohabiting: 450000 }
    },

    // 特定親族特別控除 (所得税): bands は [所得の下限 (超), 上限 (以下), 控除額]。2025年開始。
    SPECIAL_DEPENDENT_BANDS: {
      2025: [
        [580000, 850000, 630000], [850000, 900000, 610000], [900000, 950000, 510000],
        [950000, 1000000, 410000], [1000000, 1050000, 310000], [1050000, 1100000, 210000],
        [1100000, 1150000, 110000], [1150000, 1200000, 60000], [1200000, 1230000, 30000]
      ],
      2026: [
        [620000, 850000, 630000], [850000, 900000, 610000], [900000, 950000, 510000],
        [950000, 1000000, 410000], [1000000, 1050000, 310000], [1050000, 1100000, 210000],
        [1100000, 1150000, 110000], [1150000, 1200000, 60000], [1200000, 1230000, 30000]
      ]
    },

    // 特定親族特別控除 (住民税): 2025年以降で共通の帯 (従来どおり年で変えない)
    RESIDENT_SPECIAL_DEPENDENT_BANDS: [
      [580000, 950000, 450000], [950000, 1000000, 410000], [1000000, 1050000, 310000],
      [1050000, 1100000, 210000], [1100000, 1150000, 110000], [1150000, 1200000, 60000],
      [1200000, 1230000, 30000]
    ],

    // 生命保険料控除: limits は [全額控除の上限, 1/2+limits[0]/2 の上限, 1/4+limits[1]/2 の上限]、cap は控除上限。
    // newLifeUnder23 は 2026年以降・23歳未満の扶養親族がいる場合の新生命保険料の特例。
    LIFE: {
      standard: { limits: [20000, 40000, 80000], cap: 40000 },
      old: { limits: [25000, 50000, 100000], cap: 50000 },
      newLifeUnder23: { limits: [30000, 60000, 120000], cap: 60000 }
    },

    // 所得税率: [課税所得の上限, 税率]
    INCOME_TAX_RATES: [
      { limit: 1949000, rate: 0.05 }, { limit: 3299000, rate: 0.10 },
      { limit: 6949000, rate: 0.20 }, { limit: 8999000, rate: 0.23 },
      { limit: 17999000, rate: 0.33 }, { limit: 39999000, rate: 0.40 },
      { limit: null, rate: 0.45 }
    ]
  };

  root.FurusatoTaxTables = FurusatoTaxTables;
  if (typeof module !== 'undefined' && module.exports) module.exports = FurusatoTaxTables;
})(typeof window !== 'undefined' ? window : globalThis);
