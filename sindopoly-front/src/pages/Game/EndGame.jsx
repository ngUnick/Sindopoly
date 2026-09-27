import { useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrophy } from "@fortawesome/free-solid-svg-icons";
import { Button } from "antd";
import { END_GAME_CONTENT } from "../../features/game/content/el.js";
import { readCompletionNavigationState } from "../../features/game/presentation/gameViewModel.js";
import "./EndGame.css";

const CELEBRATION_SPARKS = 8;

const EndGame = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const completion = readCompletionNavigationState(location.state);
  const winner = completion?.standings.find(standing => standing.winner) ?? null;

  return (
    <main className="endgame-shell" aria-labelledby="endgame-title">
      <div className="endgame-shell__scrim" aria-hidden="true" />
      <article className="endgame-result">
        <header className="endgame-result__header">
          <p className="endgame-result__eyebrow">{END_GAME_CONTENT.gameFinished}</p>
          <h1 id="endgame-title">{END_GAME_CONTENT.title}</h1>
        </header>

        {winner && completion ? (
          <>
            <section className="endgame-winner" aria-labelledby="endgame-winner-name">
              <div className="endgame-celebration" aria-hidden="true">
                {Array.from({ length: CELEBRATION_SPARKS }, (_, index) => (
                  <span key={index} className={`endgame-spark endgame-spark--${index + 1}`} />
                ))}
              </div>
              <div className="endgame-winner__trophy" aria-hidden="true">
                <FontAwesomeIcon icon={faTrophy} />
              </div>
              <p className="endgame-winner__label">{END_GAME_CONTENT.winner}</p>
              <h2 id="endgame-winner-name">{winner.nickname}</h2>
              <dl className="endgame-winner__summary">
                <div>
                  <dt>{END_GAME_CONTENT.totalValue}</dt>
                  <dd className="u-tabular-numbers">{winner.totalValueText}</dd>
                </div>
                <div>
                  <dt>{END_GAME_CONTENT.finalBalance}</dt>
                  <dd className="u-tabular-numbers">{winner.cashText}</dd>
                </div>
                <div>
                  <dt>{END_GAME_CONTENT.propertyValue}</dt>
                  <dd className="u-tabular-numbers">{winner.propertyValueText}</dd>
                </div>
              </dl>
            </section>

            <section className="endgame-standings" aria-labelledby="endgame-standings-title">
              <div className="endgame-standings__heading">
                <h2 id="endgame-standings-title">{END_GAME_CONTENT.finalStandings}</h2>
                <p>{END_GAME_CONTENT.standingsDescription}</p>
              </div>
              <ol className="endgame-standings__list">
                {completion.standings.map(standing => (
                  <li
                    key={standing.playerId}
                    className={`endgame-standing${standing.winner ? " endgame-standing--winner" : ""}`}
                  >
                    <span className="endgame-standing__rank u-tabular-numbers">
                      {standing.rankText}
                    </span>
                    <span className="endgame-standing__identity">
                      <strong>{standing.nickname}</strong>
                      {standing.winner && (
                        <span className="endgame-standing__winner-label">
                          <FontAwesomeIcon icon={faTrophy} aria-hidden="true" />
                          {END_GAME_CONTENT.winner}
                        </span>
                      )}
                    </span>
                    <span className="endgame-standing__value">
                      <small>{END_GAME_CONTENT.totalValue}</small>
                      <strong className="u-tabular-numbers">{standing.totalValueText}</strong>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        ) : (
          <p className="endgame-result__unavailable" role="alert">
            {END_GAME_CONTENT.resultUnavailable}
          </p>
        )}

        <footer className="endgame-result__actions">
          <Button className="endgame-primary" onClick={() => navigate("/")} type="primary">
            {END_GAME_CONTENT.returnHome}
          </Button>
        </footer>
      </article>
    </main>
  );
};

export default EndGame;
