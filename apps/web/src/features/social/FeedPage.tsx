import { Link } from 'react-router';
import { DiaryList } from './DiaryList.tsx';

export function FeedPage() {
  return (
    <section aria-labelledby="feed-heading">
      <h1 id="feed-heading">みんなの日記</h1>
      <DiaryList
        path="/feed"
        empty="まだ読める絵日記がありません。フォローを申請し、承認されると、公開中の絵日記がここに表示されます。"
      />
      <p>
        <Link to="/connections">フォローの管理</Link>
      </p>
    </section>
  );
}
