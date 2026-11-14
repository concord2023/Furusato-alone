// integration.js — 外部連携 (Google Drive / ローカル取り込み) の受け口。
//
// 以前はこのファイル自体が存在せず、設定画面 (settings.html) が読み込みエラーに
// なり、未定義の FurusatoGoogleDrive / FurusatoImport を呼んで処理が止まっていた。
// Google Drive 連携は未実装のため、実際の連携を伴う呼び出しは「未実装」の
// エラーを返す (設定画面側の try/catch で失敗として表示される)。
// クライアントIDの保存・読み出しだけは localStorage で実際に動作する。
window.FurusatoGoogleDrive = {
  getClientId() {
    try { return localStorage.getItem('furusatoGoogleDriveClientId') || ''; } catch (e) { return ''; }
  },
  setClientId(v) {
    const id = String(v || '').trim();
    try {
      if (id) localStorage.setItem('furusatoGoogleDriveClientId', id);
      else localStorage.removeItem('furusatoGoogleDriveClientId');
    } catch (e) { /* 保存できなくても画面は止めない */ }
    return id;
  },
  signOut() { /* 未実装のため破棄するトークンは無い */ },
  async authorize() { throw new Error('Google Drive連携は未実装です'); },
  async listCandidateFiles() { throw new Error('Google Drive連携は未実装です'); },
  async scanAndImport() { throw new Error('Google Drive連携は未実装です'); },
  getRuntimeDiagnostics() { return []; },
  getLastOcrImageDataUrl() { return ''; }
};

// ローカル取り込み (テスト用) の受け口。解析処理は未実装のため空の結果を返す。
// settings.html 側は「認識できませんでした」等の表示になる (エラーにはならない)。
window.FurusatoImport = {
  parseSalaryCSV() {
    console.warn('FurusatoImport.parseSalaryCSV は未実装です');
    return [];
  },
  importEmails() {
    console.warn('FurusatoImport.importEmails は未実装です');
    return { added: 0, duplicates: 0, review: 0 };
  }
};
