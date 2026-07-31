(() => {
  "use strict";

  let currentPage = "home";

  const render = () => {
    const app = document.getElementById("root");
    if (!app) return;

    app.innerHTML = `
      <div class="app">
        ${renderHeader()}
        <main class="main">${renderPage()}</main>
        ${renderFooter()}
      </div>
    `;

    bindEvents();
  };

  const renderHeader = () => `
    <header class="header">
      <nav class="nav">
        <div class="logo" data-nav="home">🚀 Power Pages Site</div>
        <ul class="nav-links">
          <li><a data-nav="home" class="${currentPage === "home" ? "active" : ""}">ホーム</a></li>
          <li><a data-nav="about" class="${currentPage === "about" ? "active" : ""}">概要</a></li>
        </ul>
      </nav>
    </header>
  `;

  const renderPage = () => (currentPage === "about" ? renderAbout() : renderHome());

  const renderHome = () => `
    <div class="page">
      <section class="hero">
        <h1>Code Site テンプレートは準備完了です</h1>
        <p>このテンプレートは HashRouter / 認証導線 / Dataverse API 連携を前提に拡張できます。</p>
        <div class="status-card">
          <div class="status-icon">⚙️</div>
          <p>次のステップ: corporate-lp テンプレートをベースに実装を開始</p>
        </div>
        <div class="hero-actions">
          <a class="btn btn-primary" href="/SignIn?returnUrl=/">ログイン導線確認</a>
          <a class="btn" data-nav="about">実装方針を見る</a>
        </div>
      </section>
    </div>
  `;

  const renderAbout = () => `
    <div class="page">
      <h2>テンプレート方針</h2>
      <ul>
        <li>認証判定は Portal.User を利用（/_api/contacts で判定しない）</li>
        <li>Dataverse 呼び出しは /_api をラップした共通クライアント経由</li>
        <li>ログインは /_layout/tokenhtml + ExternalLogin POST を推奨</li>
      </ul>
    </div>
  `;

  const renderFooter = () => `
    <footer class="footer">
      <p>&copy; ${new Date().getFullYear()} Power Pages Site</p>
    </footer>
  `;

  const bindEvents = () => {
    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", () => {
        const target = el.dataset.nav;
        if (!target) return;
        currentPage = target;
        render();
      });
    });
  };

  document.addEventListener("DOMContentLoaded", render);
})();
