import { NavLink, Outlet } from 'react-router';

/** ログイン後の共通レイアウト */
export function Layout() {
  return (
    <div className="app">
      <header className="app-header">
        <NavLink to="/" className="brand">
          絵日記
        </NavLink>
        <nav aria-label="メイン">
          <ul>
            <li>
              <NavLink to="/diaries/new">書く</NavLink>
            </li>
            <li>
              <NavLink to="/calendar">カレンダー</NavLink>
            </li>
            <li>
              <NavLink to="/feed">みんなの日記</NavLink>
            </li>
            <li>
              <NavLink to="/connections">フォロー</NavLink>
            </li>
            <li>
              <NavLink to="/profile">プロフィール</NavLink>
            </li>
          </ul>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
