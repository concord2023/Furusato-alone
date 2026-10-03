ふるさと納税 上限管理アプリ

今回の修正：
- 手動入力の反映先を「源泉徴収票ベース」「給与・賞与ベース」の2列で管理。
- 反映先チェックは独立しており、両方ONにできる。
- チェックは源泉徴収票そのものを選択するものではなく、手動入力値をどちらの計算へ反映するかを指定。
- 支払金額・社会保険料などの自動取得項目は、この画面で反映先を選択しない。
- 手動入力項目：特別支給等給与加算、生命保険料控除、地震・旧長期損害控除、iDeCo、本人の国民年金、娘の国民年金、扶養・特定親族等、所得金額調整控除。
- 源泉徴収票がない年度は源泉徴収票ベース列を無効化。
- 給与・賞与ベースでは、各手動項目のON/OFFに応じてのみ手動値を計算へ反映。
- 源泉徴収票ベースでも同様に、ONにした手動項目だけを源泉票側の計算へ反映。
- 両方ONの場合は、2つの計算を独立して実行し、手動値を合算しない。

個人データはこのZIPには含めていません。

- v5: 手動チェック変更を即時保存・比較表へ反映。源泉徴収票の「給与所得控除後（調整控除後）」を二重に所得金額調整控除しない。給与・賞与ベースの手動加算は「給与・賞与のみ＋手動加算＝総支払額」と明示。2026年基礎控除の489万円超655万円以下を67万円に修正。

v6 changes (2026-10-03):
- Comparison table separates ordinary/family dependent deduction from special dependent special deduction.
- Source withholding special-dependent deduction is read from specialDependent and included in tax/resident-tax calculations.
- Manual dependent inputs are split into ordinary dependent deduction and special dependent special deduction; both are included in calculations when enabled.
- Social insurance comparison now shows automatic base + manual self pension + manual daughter pension = final total, making missing manual additions visible.
- Daughter National Pension is added independently to both source/salary calculations when both targets are checked.
