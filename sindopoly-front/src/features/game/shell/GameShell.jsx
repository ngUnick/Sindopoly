import PropTypes from "prop-types";
import "./GameShell.css";

/**
 * Owns responsive game-page composition without taking ownership of gameplay.
 * Optional regions are omitted entirely until a real feature supplies them.
 */
export default function GameShell({
  header,
  players,
  board,
  context,
  actions,
}) {
  const classNames = [
    "game-shell",
    header && "game-shell--has-header",
    players && "game-shell--has-players",
    context && "game-shell--has-context",
    actions && "game-shell--has-actions",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main
      className={classNames}
      data-game-shell-mode="responsive"
    >
      {header && (
        <header className="game-shell__header" data-game-shell-region="header">
          {header}
        </header>
      )}

      <div className="game-shell__layout">
        {players && (
          <aside
            className="game-shell__players"
            data-game-shell-region="players"
          >
            {players}
          </aside>
        )}

        <section className="game-shell__board" data-game-shell-region="board">
          {board}
        </section>

        {context && (
          <aside
            className="game-shell__context"
            data-game-shell-region="context"
          >
            {context}
          </aside>
        )}
      </div>

      {actions && (
        <section
          className="game-shell__actions"
          data-game-shell-region="actions"
        >
          {actions}
        </section>
      )}
    </main>
  );
}

GameShell.propTypes = {
  header: PropTypes.node,
  players: PropTypes.node,
  board: PropTypes.node.isRequired,
  context: PropTypes.node,
  actions: PropTypes.node,
};
