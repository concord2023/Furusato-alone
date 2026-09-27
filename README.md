# ふるさと納税 上限管理（Standalone）

## 基本方針
- PDFはブラウザで読みません。
- PDFはChatGPTのLibraryにアップロードし、ChatGPTが資料を確認・整理します。
- ChatGPTが作ったアプリ用JSONを、この画面へ貼り付けて「反映する」と、端末内IndexedDBへ保存します。
- 給与・賞与・源泉徴収票の**読み取った全項目**を保存し、アプリ内の「読み取り済みデータDB」で確認できます。
- 公開GitHubには個人の給与データを置かない設計です。同梱の `furusato-data.json` は空の公開用シードです。

## 使い方
1. ChatGPTのLibraryへ給与明細・賞与明細・源泉徴収票などをアップロード。
2. このアプリの「ChatGPTへの更新依頼文をコピー」を使って、ChatGPTへ反映を依頼。
3. ChatGPTが資料を読み、`{"version":1,"documents":[...]}` 形式のJSONを作る。
4. JSONをアプリの「ChatGPTからデータを反映」欄へ貼り付け、「ChatGPTデータを反映する」を押す。
5. 「読み取り済みデータDB」で、課税対象額・支給合計・非課税額・社会保険各項目・持株関連項目など、実際に保存された全フィールドを確認する。

## データの保存場所
個人データはブラウザのIndexedDB（`furusatoStandaloneDB`）に保存します。GitHub Pagesへ個人データを自動アップロードする仕組みはありません。

## 計算ステージ
- 給与は原則として明細の `taxable`（課税対象額）を予測基準に使用。
- 12月実績がなければ、保存済み1〜11月実績から12月を予測。
- 12月実績が入ったら予測値を実績へ置換。
- 源泉徴収票は予測段階では使わず、実績反映後の比較・最終計算用データとして保持。
- 保存DBにある項目と、実際に上限計算へ使う項目を画面上で分けて表示。
- 賞与は保存済み実績を使用し、根拠のない推測値を勝手に保存しません。

## JSONの基本形
```json
{
  "version": 1,
  "documents": [
    {
      "id": "2026-salary-08",
      "kind": "salary",
      "year": 2026,
      "month": 8,
      "name": "給与明細.pdf",
      "taxable": 784190,
      "totalPayment": 797690,
      "nonTaxable": 13500,
      "social": 96870,
      "employment": 3988,
      "health": 14052,
      "healthSpecial": 12093,
      "care": 6308,
      "childSupport": 954,
      "incomeTax": 58560,
      "residentTax": 87500
    }
  ]
}
```
`documents` の各要素には、資料から読み取れた追加項目もそのまま入れてください。たとえば `stockOwnership` などです。
