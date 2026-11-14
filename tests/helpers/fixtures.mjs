// 計算の特性テスト用フィクスチャ。
// 年の境界・金額の境界を網羅し、税率テーブル切り出し前後で結果が完全一致することを保証する。

const YEARS = [2023, 2024, 2025, 2026, 2027];

function salaryDocs(year, months = 9) {
  const docs = [];
  for (let m = 1; m <= months; m++) {
    docs.push({ kind: 'salary', year, month: m, taxable: 480000 + m * 5000, social: 72000 });
  }
  return docs;
}

function bonusDocs(year) {
  return [
    { kind: 'bonus', year, month: 7, taxable: 900000, social: 135000 },
    { kind: 'bonus', year: year - 1, month: 7, taxable: 850000, social: 127500 },
    { kind: 'bonus', year: year - 1, month: 12, taxable: 880000, social: 132000 }
  ];
}

export function buildCases(calc) {
  const out = {};

  const grosses = [0, 1000000, 1625000, 1625001, 1800000, 1900000, 1900001, 2200000, 2200001, 3600000, 6600000, 8500000, 8500001, 12000000];
  out.salaryDeduction = YEARS.map((y) => grosses.map((g) => calc.salaryDeduction(g, y)));
  out.residentSalaryDeduction = YEARS.map((y) => grosses.map((g) => calc.residentSalaryDeduction(g, y)));

  const incomes = [0, 1320000, 1320001, 3360000, 4890000, 6550000, 6550001, 23500000, 24000000, 24500000, 25000000, 25000001, 30000000];
  out.basicDeduction = YEARS.map((y) => incomes.map((i) => calc.basicDeduction(i, y)));
  out.residentBasicDeduction = incomes.map((i) => calc.residentBasicDeduction(2026, i));

  out.dependentIncomeLimit = [2023, 2024, 2025, 2026, 2027, 2028].map((y) => calc.dependentIncomeLimit(y));

  const manuals = [
    {},
    { dependentsGeneral: 2, dependentsSpecific: 1, dependentsElderly: 2, dependentsElderlyCohabiting: 1 },
    { dependentsGeneral: 1, dependentsElderly: 1, dependentsElderlyCohabiting: 5 },
    ...[580000, 580001, 620000, 620001, 850000, 900000, 1000000, 1230000, 1230001, 1300000].map((inc) => ({ specialDependentCount: 1, specialDependentIncome: inc })),
    { specialDependentCount: 2, specialDependentIncome: 700000 },
    { specialDependentCount: 1, specialDependentIncome: 0 }
  ];
  out.dependentBreakdown = YEARS.map((y) => manuals.map((m) => calc.dependentBreakdown(m, y)));
  out.dependentBreakdownFallback = [2025, 2026].map((y) => [
    calc.dependentBreakdown({ specialDependentCount: 1, specialDependentIncome: 0 }, y, 630000),
    calc.dependentBreakdown({ specialDependentCount: 2, specialDependentIncome: 0 }, y, 450000)
  ]);
  out.dependentDeduction = YEARS.map((y) => manuals.map((m) => calc.dependentDeduction(m, y)));
  out.residentDependentDeduction = YEARS.map((y) => manuals.map((m) => calc.residentDependentDeduction(m, y)));

  const premiums = [0, 10000, 20000, 25000, 30000, 40000, 50000, 60000, 80000, 100000, 120000, 120001, 200000];
  out.lifeDeduction = ['new', 'old', 'newLife'].map((t) =>
    [2025, 2026].map((y) => [false, true].map((u) => premiums.map((p) => calc.lifeDeduction(p, t, y, u))))
  );
  const lifeManuals = [
    { newLife: 60000, oldLife: 30000, medical: 40000, newPension: 20000, oldPension: 70000 },
    { oldLife: 150000, newLife: 10000 },
    { newLife: 130000, under23Dependent: true },
    { newLife: 50000, oldLife: 80000, medical: 90000, newPension: 110000, oldPension: 10000, under23Dependent: true },
    {}
  ];
  out.calcLife = YEARS.map((y) => lifeManuals.map((m) => calc.calcLife(m, y)));
  out.earthquakeDeduction = [{}, { earthquake: 30000 }, { earthquake: 80000, oldLongTermDamage: 20000 }, { earthquake: 10000, oldLongTermDamage: 5000 }]
    .map((m) => calc.earthquakeDeduction(m));

  const taxables = [0, 1949000, 1949001, 3299000, 6949000, 8999000, 17999000, 39999000, 39999001, 100000000];
  out.incomeTaxRate = taxables.map((t) => calc.incomeTaxRate(t));

  // 予測計算 (源泉徴収票なし): 給与9か月分 + 賞与 (当年・前年)
  calc.__reset();
  calc.__setManual(2026, { newLife: 50000, ideco: 276000, dependentsGeneral: 1, specialDependentCount: 1, specialDependentIncome: 700000, nationalPension: 200000 });
  const docs2026 = [...salaryDocs(2026), ...bonusDocs(2026)];
  calc.__setDocuments(docs2026);
  out.forecastSalaryBonus2026 = calc.forecastSalaryBonus(docs2026, 2026);
  out.forecastNoWithholding2026 = calc.forecast(docs2026, 2026);

  // 予測計算 (源泉徴収票あり): 最も重い計算パスを通す
  calc.__reset();
  calc.__setManual(2026, { newLife: 50000, ideco: 100000, dependentsGeneral: 0, nationalPension: 0 });
  const withholding = {
    kind: 'withholding', year: 2026, paymentAmount: 6800000, socialInsurance: 980000,
    salaryIncomeAfterDeduction: 5200000, lifeInsuranceDeduction: 120000,
    dependentGeneralCount: 1, dependentSpecificCount: 1, ideco: 276000
  };
  const docsW = [...salaryDocs(2026), ...bonusDocs(2026), withholding];
  calc.__setDocuments(docsW);
  out.forecastWithholding2026 = calc.forecast(docsW, 2026);

  calc.__reset();
  calc.__setManual(2025, { newLife: 40000, specialDependentCount: 1, specialDependentIncome: 600000 });
  const withholding25 = {
    kind: 'withholding', year: 2025, paymentAmount: 6500000, socialInsurance: 940000,
    newLifeInsurance: 60000, oldLifeInsurance: 30000, dependentElderlyCount: 1, dependentElderlyCohabitingCount: 1
  };
  const docsW25 = [...salaryDocs(2025), ...bonusDocs(2025), withholding25];
  calc.__setDocuments(docsW25);
  out.forecastWithholding2025 = calc.forecast(docsW25, 2025);

  calc.__reset();
  return out;
}
