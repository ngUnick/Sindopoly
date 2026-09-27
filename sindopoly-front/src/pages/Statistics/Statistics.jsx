import { useEffect, useState } from "react";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Spin, Table, message } from "antd";
import { useNavigate } from "react-router-dom";
import { StatisticsAPI } from "../../apis/StatisticsAPI";
import PregameShell from "../../features/pregame/PregameShell.jsx";
import { STATISTICS_CONTENT } from "../../features/game/content/el.js";

export default function Statistics() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [myStats, setMyStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const navigate = useNavigate();

  const loadStatistics = async () => {
    setLoading(true);
    try {
      const playerId = localStorage.getItem("player_id");
      const [leaderboardResult, personalResult] = await Promise.all([
        StatisticsAPI.getLeaderboard(),
        StatisticsAPI.getUserStats(playerId),
      ]);

      setLeaderboard(leaderboardResult.map((player, index) => ({
        key: index,
        nickname: player.nickname,
        totalWins: player.totalWins,
        totalGames: player.totalGames,
        winRate: `${player.winRate.toFixed(2)} %`,
      })));
      setMyStats({
        nickname: personalResult.nickname,
        wins: personalResult.totalWins,
        games: personalResult.totalGames,
        winRate: `${(personalResult.winRate * 100).toFixed(2)} %`,
      });
      setLoadFailed(false);
    } catch (error) {
      setLoadFailed(true);
      message.error(STATISTICS_CONTENT.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadStatistics(); }, []);

  const columns = [
    { title: STATISTICS_CONTENT.player, dataIndex: "nickname" },
    {
      title: STATISTICS_CONTENT.wins,
      dataIndex: "totalWins",
      align: "right",
      sorter: (first, second) => first.totalWins - second.totalWins,
    },
    {
      title: STATISTICS_CONTENT.games,
      dataIndex: "totalGames",
      align: "right",
      sorter: (first, second) => first.totalGames - second.totalGames,
    },
    {
      title: STATISTICS_CONTENT.winRate,
      dataIndex: "winRate",
      align: "right",
      sorter: (first, second) => parseFloat(first.winRate) - parseFloat(second.winRate),
    },
  ];

  return (
    <PregameShell
      variant="wide"
      title={STATISTICS_CONTENT.title}
      description={STATISTICS_CONTENT.description}
    >
      {loading ? (
        <div className="pregame-status" role="status" aria-live="polite">
          <Spin size="small" />
          <p>{STATISTICS_CONTENT.loading}</p>
        </div>
      ) : loadFailed ? (
        <div className="pregame-status" role="alert">
          <p>{STATISTICS_CONTENT.loadFailed}</p>
          <Button className="pregame-utility" onClick={loadStatistics}>
            {STATISTICS_CONTENT.retry}
          </Button>
        </div>
      ) : (
        <>
          {myStats && (
            <section className="pregame-personal-stats" aria-labelledby="personal-stats-heading">
              <h2 id="personal-stats-heading" className="pregame-section__title">
                {STATISTICS_CONTENT.yourStats} — {myStats.nickname}
              </h2>
              <dl className="pregame-stat-grid">
                <div><dt>{STATISTICS_CONTENT.wins}</dt><dd>{myStats.wins}</dd></div>
                <div><dt>{STATISTICS_CONTENT.games}</dt><dd>{myStats.games}</dd></div>
                <div><dt>{STATISTICS_CONTENT.winRate}</dt><dd>{myStats.winRate}</dd></div>
              </dl>
            </section>
          )}

          <section className="pregame-section" aria-labelledby="leaderboard-heading">
            <h2 id="leaderboard-heading" className="pregame-section__title">{STATISTICS_CONTENT.leaderboard}</h2>
            {leaderboard.length === 0 ? (
              <div className="pregame-empty" role="status"><p>{STATISTICS_CONTENT.noLeaderboard}</p></div>
            ) : (
              <div className="pregame-table-wrap">
                <Table
                  className="pregame-table"
                  columns={columns}
                  dataSource={leaderboard}
                  pagination={false}
                  size="small"
                  rowKey="key"
                />
              </div>
            )}
          </section>
        </>
      )}

      <div className="pregame-navigation">
        <Button
          type="text"
          className="pregame-utility"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/")}
        >
          {STATISTICS_CONTENT.backHome}
        </Button>
      </div>
    </PregameShell>
  );
}
