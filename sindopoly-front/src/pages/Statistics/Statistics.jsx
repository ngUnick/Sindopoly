import { useEffect, useState } from "react";
import { Table, Spin, message } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { StatisticsAPI } from "../../apis/StatisticsAPI";
import bgImg from "../../assets/images/monopoly_bg.png";
import { STATISTICS_CONTENT } from "../../features/game/content/el.js";

const antIcon = <LoadingOutlined style={{ fontSize: 24 }} spin />;

export default function Statistics() {
  /* ─ state ─────────────────────────────────── */
  const [leaderboard, setLeaderboard] = useState([]);
  const [myStats,     setMyStats]     = useState(null);
  const [loading,     setLoading]     = useState(true);

  /* ─ fetch once on mount ───────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const playerId = localStorage.getItem("player_id");   // ← current user

        /* parallel fetches */
        const [lb, me] = await Promise.all([
          StatisticsAPI.getLeaderboard(),
          StatisticsAPI.getUserStats(playerId),
        ]);

        /* leaderboard rows */
        setLeaderboard(
          lb.map((p, i) => ({
            key: i,
            rank: i + 1,
            nickname: p.nickname,
            totalWins: p.totalWins,
            totalGames: p.totalGames,
            winRate: (p.winRate).toFixed(2) + " %",
          }))
        );

        /* current-user card */
        setMyStats({
          nickname:  me.nickname,
          wins:      me.totalWins,
          games:     me.totalGames,
          winRate:   (me.winRate * 100).toFixed(2) + " %",
        });
      } catch (e) {
        message.error(STATISTICS_CONTENT.loadFailed);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ─ table columns ─────────────────────────── */
  const columns = [
    { title: STATISTICS_CONTENT.player, dataIndex: "nickname" },
    {
      title: STATISTICS_CONTENT.wins,
      dataIndex: "totalWins",
      sorter: (a, b) => a.totalWins - b.totalWins,
    },
    {
      title: STATISTICS_CONTENT.games,
      dataIndex: "totalGames",
      sorter: (a, b) => a.totalGames - b.totalGames,
    },
    {
      title: STATISTICS_CONTENT.winRate,
      dataIndex: "winRate",
      sorter: (a, b) =>
        parseFloat(a.winRate) - parseFloat(b.winRate),
    },
  ];

  /* ─ render ────────────────────────────────── */
  return (
    <div className="flex-grow flex justify-center items-center bg-cover bg-no-repeat" style={{ backgroundImage: `url(${bgImg})` }}>
      <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0" />

      <div className="bg-[rgba(255,236,195,0.85)] py-6 px-6 backdrop-blur-sm border border-[rgba(255,255,255,0.6)] rounded-md min-w-[520px]">
        {loading ? (
          <div className="flex justify-center">
            <Spin indicator={antIcon} />
          </div>
        ) : (
          <>
            {/* ---------- your own stats card ---------- */}
            {myStats && (
              <div className="mb-6 border-b pb-2">
                <h3 className="font-semibold text-gray-800 mb-3">
                  {STATISTICS_CONTENT.yourStats} — {myStats.nickname}
                </h3>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xl font-bold">{myStats.wins}</div>
                    <div className="text-xs uppercase text-gray-600">{STATISTICS_CONTENT.wins}</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold">{myStats.games}</div>
                    <div className="text-xs uppercase text-gray-600">{STATISTICS_CONTENT.games}</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold">{myStats.winRate}</div>
                    <div className="text-xs uppercase text-gray-600">{STATISTICS_CONTENT.winRate}</div>
                  </div>
                </div>
              </div>
            )}

            {/* -------------- leaderboard -------------- */}
            <h2 className="text-center text-xl font-bold mb-3">
              {STATISTICS_CONTENT.leaderboard}
            </h2>

            <Table
              columns={columns}
              dataSource={leaderboard}
              pagination={false}
              size="small"
              rowKey="key"
            />
          </>
        )}
      </div>
    </div>
  );
}
