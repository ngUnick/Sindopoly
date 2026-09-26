import PropTypes from "prop-types";
import monopolyLogo from "../../assets/images/monopoly_logo.png";
import "./PregameShell.css";

/** Shared atmospheric frame for pregame routes; page-specific actions remain with each route. */
export default function PregameShell({ children, description, title, variant = "compact" }) {
  const titleId = `pregame-${variant}-title`;

  return (
    <main className="pregame-shell">
      <div className="pregame-shell__scrim" aria-hidden="true" />
      <section
        className={`pregame-panel pregame-panel--${variant}`}
        aria-labelledby={titleId}
      >
        <header className="pregame-panel__header">
          <img className="pregame-panel__logo" src={monopolyLogo} alt="Sindopoly" />
          <div className="pregame-panel__copy">
            <h1 id={titleId}>{title}</h1>
            {description && <p>{description}</p>}
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}

PregameShell.propTypes = {
  children: PropTypes.node.isRequired,
  description: PropTypes.string,
  title: PropTypes.string.isRequired,
  variant: PropTypes.oneOf(["compact", "wide"]),
};
