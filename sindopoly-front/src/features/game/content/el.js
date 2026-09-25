import { TRANSPORT_ERROR_CODES } from "../../../apis/transportError.js";

export const CONTENT_ACTIONS = Object.freeze({
  NONE: "NONE",
  SIGN_IN: "SIGN_IN",
  RETRY: "RETRY",
  REFRESH: "REFRESH",
});

const errorContent = (message, severity, action) => Object.freeze({ message, severity, action });

export const ERROR_CONTENT = Object.freeze({
  [TRANSPORT_ERROR_CODES.UNAUTHENTICATED]: errorContent(
    "Η συνεδρία σου έχει λήξει. Συνδέσου ξανά.", "warning", CONTENT_ACTIONS.SIGN_IN,
  ),
  [TRANSPORT_ERROR_CODES.FORBIDDEN]: errorContent(
    "Δεν έχεις δικαίωμα να κάνεις αυτή την ενέργεια.", "error", CONTENT_ACTIONS.NONE,
  ),
  [TRANSPORT_ERROR_CODES.NOT_FOUND]: errorContent(
    "Το παιχνίδι που ζήτησες δεν είναι διαθέσιμο.", "warning", CONTENT_ACTIONS.NONE,
  ),
  [TRANSPORT_ERROR_CODES.VALIDATION]: errorContent(
    "Έλεγξε τα στοιχεία και προσπάθησε ξανά.", "warning", CONTENT_ACTIONS.NONE,
  ),
  [TRANSPORT_ERROR_CODES.STALE_STATE]: errorContent(
    "Το παιχνίδι έχει ήδη αλλάξει. Ενημερώνουμε την κατάσταση…", "info", CONTENT_ACTIONS.REFRESH,
  ),
  [TRANSPORT_ERROR_CODES.CONFLICT]: errorContent(
    "Η ενέργεια δεν ολοκληρώθηκε, επειδή το παιχνίδι άλλαξε.", "warning", CONTENT_ACTIONS.REFRESH,
  ),
  [TRANSPORT_ERROR_CODES.NETWORK]: errorContent(
    "Δεν υπάρχει σύνδεση με τον διακομιστή.", "warning", CONTENT_ACTIONS.RETRY,
  ),
  [TRANSPORT_ERROR_CODES.SERVER]: errorContent(
    "Παρουσιάστηκε πρόβλημα στον διακομιστή.", "error", CONTENT_ACTIONS.RETRY,
  ),
  [TRANSPORT_ERROR_CODES.INVALID_PAYLOAD]: errorContent(
    "Λάβαμε μη έγκυρα δεδομένα. Γίνεται επαναφόρτωση της κατάστασης.", "error", CONTENT_ACTIONS.REFRESH,
  ),
  [TRANSPORT_ERROR_CODES.UNKNOWN]: errorContent(
    "Κάτι πήγε στραβά. Προσπάθησε ξανά.", "error", CONTENT_ACTIONS.RETRY,
  ),
});

/** Maps stable failure identity only; exception messages and diagnostics are never rendered. */
export function contentForTransportError(error) {
  const code = typeof error === "string" ? error : error?.code;
  return ERROR_CONTENT[code] ?? ERROR_CONTENT[TRANSPORT_ERROR_CODES.UNKNOWN];
}

export const HOME_CONTENT = Object.freeze({
  createGame: "Δημιουργία παιχνιδιού",
  joinGame: "Συμμετοχή σε παιχνίδι",
  statistics: "Στατιστικά",
  leaveChangeNickname: "Έξοδος και αλλαγή ψευδωνύμου",
  createNewGame: "Δημιουργία νέου παιχνιδιού",
  create: "Δημιουργία",
  public: "Δημόσιο",
  private: "Ιδιωτικό",
  continueGame: "Συνέχεια παιχνιδιού",
  checkingCurrentGame: "Έλεγχος τρέχοντος παιχνιδιού…",
  currentGameUnavailable: "Το τρέχον παιχνίδι δεν είναι διαθέσιμο",
  retry: "Προσπάθησε ξανά",
  cannotOpenCurrentGame: "Δεν ήταν δυνατό να ανοίξει το τρέχον παιχνίδι.",
});

export const LOGIN_CONTENT = Object.freeze({
  start: "Έναρξη",
  chooseNickname: "Επίλεξε ψευδώνυμο",
  continue: "Συνέχεια",
  nicknamePlaceholder: "Πληκτρολόγησε το ψευδώνυμό σου",
  nicknameMin: "Το ψευδώνυμο πρέπει να έχει τουλάχιστον 2 χαρακτήρες.",
  nicknameMax: "Το ψευδώνυμο δεν μπορεί να ξεπερνά τους 15 χαρακτήρες.",
  nicknameCharacters: "Χρησιμοποίησε ελληνικά ή λατινικά γράμματα, ψηφία 0–9 ή κάτω παύλα, χωρίς κενά ή σύμβολα.",
  creatingPlayer: "Δημιουργία παίκτη…",
  createFailed: "Δεν ήταν δυνατή η αποθήκευση του ψευδωνύμου. Δοκίμασε ξανά.",
});

export const SEARCH_GAME_CONTENT = Object.freeze({
  creator: "Δημιουργός",
  players: "Παίκτες",
  action: "Ενέργεια",
  full: "Πλήρες",
  join: "Συμμετοχή",
  publicLobbies: "Δημόσια λόμπι",
  joinByCode: "Συμμετοχή με κωδικό",
  failedJoin: "Δεν ήταν δυνατή η συμμετοχή στο παιχνίδι.",
  failedLoad: "Δεν ήταν δυνατή η φόρτωση των παιχνιδιών.",
  joinedPrivate: "Συμμετείχες στο ιδιωτικό παιχνίδι!",
  invalidInvite: "Ο κωδικός πρόσκλησης είναι άκυρος ή έχει λήξει.",
  joinPrivate: "Συμμετοχή σε ιδιωτικό παιχνίδι",
  invitePlaceholder: "Πληκτρολόγησε τον κωδικό πρόσκλησης…",
});

export const STATISTICS_CONTENT = Object.freeze({
  player: "Παίκτης",
  wins: "Νίκες",
  games: "Παιχνίδια",
  winRate: "Ποσοστό νικών",
  yourStats: "Τα στατιστικά σου",
  leaderboard: "Κατάταξη",
  loadFailed: "Δεν ήταν δυνατή η φόρτωση των στατιστικών. Δοκίμασε ξανά αργότερα.",
});

export const LOBBY_CONTENT = Object.freeze({
  playerRemoved: "Ο παίκτης αφαιρέθηκε.",
  title: "Λόμπι παιχνιδιού",
  visibility: "Ορατότητα",
  public: "δημόσιο",
  private: "ιδιωτικό",
  inviteCode: "Κωδικός πρόσκλησης",
  players: "Παίκτες",
  you: "Εσύ",
  owner: "Ιδιοκτήτης 👑",
  waiting: "Αναμονή για να συμμετάσχουν παίκτες…",
  start: "Έναρξη παιχνιδιού",
  leave: "Έξοδος από το παιχνίδι",
  removePlayer: "Αφαίρεση παίκτη",
});

export const GAMEPLAY_CONTENT = Object.freeze({
  yourTurn: "Η σειρά σου",
  roll: "Ρίξε τα ζάρια",
  rolling: "Ρίψη σε εξέλιξη…",
  declinePurchase: "Δεν αγοράζω",
  rent: "Ενοίκιο",
  cash: "Μετρητά",
  balance: "Υπόλοιπο",
  properties: "Ιδιοκτησίες",
  recentEvents: "Πρόσφατα γεγονότα",
  inJail: "Στη ΦΥΛΑΚΗ",
  skipTurn: "Παράλειψη σειράς",
  turnCompleted: "Η σειρά σου ολοκληρώθηκε",
  gameCompleted: "Το παιχνίδι ολοκληρώθηκε",
  start: "ΑΦΕΤΗΡΙΑ",
  jail: "ΦΥΛΑΚΗ",
  freeParking: "ΝΑΥΤΙΛΟΣ",
  chanceCard: "ΚΑΡΤΑ ΕΝΤΟΛΗΣ",
  communityCard: "ΚΑΡΤΑ ΑΠΟΦΑΣΗΣ",
  genericCard: "ΚΑΡΤΑ",
  confirm: "Ναι",
  decline: "Όχι",
  acknowledge: "Εντάξει",
  board: "Ταμπλό",
  boardMetadataUnavailable: "Τα στοιχεία του ταμπλό δεν είναι διαθέσιμα.",
});

export const END_GAME_CONTENT = Object.freeze({
  title: "Τέλος Παιχνιδιού",
  winner: "Νικητής",
  finalBalance: "Τελικό υπόλοιπο",
  propertyValue: "Αξία ιδιοκτησιών",
  totalValue: "Συνολικό κεφάλαιο",
  rank: "Κατάταξη",
  returnHome: "Πίσω στην Αρχική",
  resultUnavailable: "Το έγκυρο τελικό αποτέλεσμα δεν είναι διαθέσιμο.",
});

export const HUD_CONTENT = Object.freeze({
  matchStatus: "Κατάσταση παιχνιδιού",
  players: "Παίκτες",
  availableActions: "Διαθέσιμες ενέργειες",
  you: "Εσύ",
  activePlayer: "Παίζει τώρα",
  bankrupt: "Χρεοκοπία",
  away: "Απών",
});

export const GAMEPLAY_FEEDBACK_CONTENT = Object.freeze({
  cardCash: "Μετρητά",
  cardMovement: "Μετακίνηση",
  cardStart: "Πέρασμα από την ΑΦΕΤΗΡΙΑ",
  cardReveal: "Κάρτα γεγονότος",
  contextualEvent: "Εξέλιξη παιχνιδιού",
  rent: "Πληρωμή ενοικίου",
  tax: "Πληρωμή φόρου",
  start: "Πέρασμα από την ΑΦΕΤΗΡΙΑ",
  purchase: "Νέα ιδιοκτησία",
  timeout: "Λήξη χρόνου",
});

export const CONNECTION_CONTENT = Object.freeze({
  connected: "Η σύνδεση είναι ενεργή.",
  sessionLoading: "Έλεγχος συνεδρίας…",
  gameLoading: "Φόρτωση παιχνιδιού…",
  commandPending: "Η ενέργεια είναι σε εξέλιξη…",
  degraded: "Οι ζωντανές ενημερώσεις διακόπηκαν προσωρινά.",
  lost: "Η σύνδεση χάθηκε.",
  reconnecting: "Γίνεται επανασύνδεση…",
  recovered: "Η σύνδεση αποκαταστάθηκε",
  stale: "Το παιχνίδι έχει ήδη αλλάξει. Ενημερώνουμε την κατάσταση…",
  gameUnavailable: "Το παιχνίδι δεν είναι διαθέσιμο.",
  gameUnauthorized: "Δεν έχεις πρόσβαση σε αυτό το παιχνίδι.",
  malformedData: "Λάβαμε μη έγκυρα δεδομένα. Γίνεται επαναφόρτωση της κατάστασης.",
  serverFailure: "Παρουσιάστηκε πρόβλημα στον διακομιστή.",
});

export const ACCESSIBILITY_CONTENT = Object.freeze({
  rollDice: "Ρίξε τα ζάρια",
  muteMusic: "Σίγαση μουσικής",
  enableMusic: "Ενεργοποίηση μουσικής",
  showProperties: "Προβολή ιδιοκτησιών",
  close: "Κλείσιμο",
  closeCard: "Κλείσιμο κάρτας",
  closeNotification: "Κλείσιμο ειδοποίησης",
  turnResultDialog: "Αποτέλεσμα γύρου",
  returnToAction: "Επιστροφή στη δράση",
  refreshConnection: "Ανανέωση σύνδεσης",
});

export const EVENT_HISTORY_CONTENT = Object.freeze({
  gap: "Χάθηκαν ενδιάμεσες ενημερώσεις· η κατάσταση συγχρονίστηκε",
});

const greekNumber = new Intl.NumberFormat("el-GR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  useGrouping: true,
});

export function formatMoney(amount) {
  if (!Number.isFinite(amount)) return "—";
  const normalized = Object.is(amount, -0) ? 0 : amount;
  return `${greekNumber.format(normalized)}€`;
}

export function formatPropertyCount(count) {
  if (!Number.isSafeInteger(count) || count < 0) return "—";
  return count === 1 ? "1 ιδιοκτησία" : `${greekNumber.format(count)} ιδιοκτησίες`;
}

export function formatPlayerIdentity(playerId) {
  return Number.isSafeInteger(playerId) && playerId > 0 ? `#${playerId}` : "—";
}

export function formatRank(rank) {
  return Number.isSafeInteger(rank) && rank > 0 ? `${greekNumber.format(rank)}η θέση` : "—";
}

export function formatSignedMoney(amount) {
  if (!Number.isFinite(amount)) return "—";
  if (amount > 0) return `+${formatMoney(amount)}`;
  return formatMoney(amount);
}

export const formatCurrentTurn = () => GAMEPLAY_CONTENT.yourTurn;

export function formatPlayingNow(playerName) {
  return hasText(playerName) ? `Παίζει τώρα: ${playerName}` : "Παίζει τώρα";
}

export function formatWaitingForPlayer(playerName) {
  return hasText(playerName) ? `Αναμονή για ${playerName}` : "Αναμονή για τον επόμενο παίκτη";
}

export function formatDiceResult(total, playerName = null) {
  if (!Number.isFinite(total)) return null;
  return hasText(playerName) ? `${playerName}: έφερε ${total}.` : `Έφερες ${total}.`;
}

export function formatTurnHandoff(nextPlayerName = null) {
  return hasText(nextPlayerName)
    ? `${GAMEPLAY_CONTENT.turnCompleted}. ${formatPlayingNow(nextPlayerName)}`
    : GAMEPLAY_CONTENT.turnCompleted;
}

export function formatPurchaseAction(amount) {
  return Number.isFinite(amount) ? `Αγορά για ${formatMoney(amount)}` : "Αγορά";
}

export function formatJailPaymentAction(amount) {
  return Number.isFinite(amount)
    ? `Πληρωμή ${formatMoney(amount)} και ρίψη`
    : "Πληρωμή και ρίψη";
}

export const GAME_EVENT_FACT_TYPES = Object.freeze({
  ROLL: "ROLL",
  LANDING: "LANDING",
  PURCHASE_AVAILABLE: "PURCHASE_AVAILABLE",
  PURCHASE: "PURCHASE",
  PURCHASE_DECLINED: "PURCHASE_DECLINED",
  RENT: "RENT",
  TAX: "TAX",
  MONEY: "MONEY",
  START_REWARD: "START_REWARD",
  CARD: "CARD",
  JAIL: "JAIL",
  JAIL_RELEASED: "JAIL_RELEASED",
  JAIL_EXIT_AVAILABLE: "JAIL_EXIT_AVAILABLE",
  TURN_CHANGE: "TURN_CHANGE",
  TIMEOUT: "TIMEOUT",
  COMPLETION: "COMPLETION",
});

/** Formats a validated presentation fact without deriving rules or action eligibility. */
export function formatGameEventFact(fact) {
  if (!fact || typeof fact !== "object") return null;
  const playerName = hasText(fact.playerName) ? fact.playerName : null;
  const squareName = hasText(fact.squareName) ? fact.squareName : null;

  switch (fact.type) {
    case GAME_EVENT_FACT_TYPES.ROLL:
      return playerName ? formatDiceResult(fact.total, playerName) : null;
    case GAME_EVENT_FACT_TYPES.LANDING:
      return playerName && squareName ? `${playerName} → ${squareName}.` : null;
    case GAME_EVENT_FACT_TYPES.PURCHASE_AVAILABLE:
      return playerName && squareName && Number.isFinite(fact.amount)
        ? `${playerName}: διαθέσιμη αγορά για ${squareName}, ${formatMoney(fact.amount)}.` : null;
    case GAME_EVENT_FACT_TYPES.PURCHASE:
      return playerName && squareName && Number.isFinite(fact.amount)
        ? `${playerName} αγόρασε: ${squareName}, ${formatMoney(fact.amount)}.` : null;
    case GAME_EVENT_FACT_TYPES.PURCHASE_DECLINED:
      return playerName && squareName ? `${playerName}: δεν έγινε αγορά για ${squareName}.` : null;
    case GAME_EVENT_FACT_TYPES.RENT:
      return playerName && hasText(fact.counterpartyName) && Number.isFinite(fact.amount)
        ? `${playerName}: πλήρωσε ${formatMoney(fact.amount)} για ενοίκιο σε ${fact.counterpartyName}.` : null;
    case GAME_EVENT_FACT_TYPES.TAX:
      return playerName && Number.isFinite(fact.amount)
        ? `${playerName}: πλήρωσε φόρο ${formatMoney(fact.amount)}.` : null;
    case GAME_EVENT_FACT_TYPES.MONEY:
      return playerName && Number.isFinite(fact.amount)
        ? `${playerName}: μεταβολή μετρητών ${formatSignedMoney(fact.amount)}.` : null;
    case GAME_EVENT_FACT_TYPES.START_REWARD:
      return playerName && Number.isFinite(fact.amount)
        ? `${playerName}: πέρασε από την ${GAMEPLAY_CONTENT.start} και έλαβε ${formatMoney(fact.amount)}.` : null;
    case GAME_EVENT_FACT_TYPES.CARD:
      return formatCardFact(fact);
    case GAME_EVENT_FACT_TYPES.JAIL:
      return playerName ? `${playerName}: στη ${GAMEPLAY_CONTENT.jail}.` : null;
    case GAME_EVENT_FACT_TYPES.JAIL_RELEASED:
      return playerName && Number.isFinite(fact.amount)
        ? `${playerName}: έξοδος από τη ${GAMEPLAY_CONTENT.jail} με πληρωμή ${formatMoney(fact.amount)}.` : null;
    case GAME_EVENT_FACT_TYPES.JAIL_EXIT_AVAILABLE:
      return playerName && Number.isFinite(fact.amount)
        ? `${playerName}: διαθέσιμη έξοδος από τη ${GAMEPLAY_CONTENT.jail} με ${formatMoney(fact.amount)}.` : null;
    case GAME_EVENT_FACT_TYPES.TURN_CHANGE:
      return playerName ? formatPlayingNow(playerName) : null;
    case GAME_EVENT_FACT_TYPES.TIMEOUT:
      return playerName ? `${playerName}: ο χρόνος έληξε.` : null;
    case GAME_EVENT_FACT_TYPES.COMPLETION:
      return hasText(fact.winnerName)
        ? `${GAMEPLAY_CONTENT.gameCompleted}. Κέρδισε: ${fact.winnerName}`
        : GAMEPLAY_CONTENT.gameCompleted;
    default:
      return null;
  }
}

export function formatTurnDestination(cardText, destinationName) {
  if (hasText(cardText) && hasText(destinationName)) {
    return `${cardText} Μετακίνηση προς ${destinationName}.`;
  }
  return hasText(destinationName) ? `Μετακίνηση προς ${destinationName}.` : null;
}

export function formatTurnMoney(cardText, amount) {
  if (!Number.isFinite(amount)) return hasText(cardText) ? cardText : null;
  if (hasText(cardText)) return `${cardText} (${formatSignedMoney(amount)})`;
  return amount >= 0 ? `Έλαβες ${formatMoney(amount)}!` : `Πλήρωσε ${formatMoney(Math.abs(amount))}.`;
}

export function formatRentOutcome(squareName, ownerName, amount) {
  if (!hasText(squareName) || !hasText(ownerName) || !Number.isFinite(amount)) return null;
  return `Προσγειώθηκες: ${squareName}. Ενοίκιο ${formatMoney(amount)} σε ${ownerName}.`;
}

export function formatPurchaseOffer(squareName, amount) {
  if (!hasText(squareName) || !Number.isFinite(amount)) return null;
  return `Η ιδιοκτησία ${squareName} είναι διαθέσιμη. Αγορά για ${formatMoney(amount)};`;
}

export function formatTaxOutcome(squareName, amount) {
  if (!hasText(squareName) || !Number.isFinite(amount)) return null;
  return `${squareName}: πληρωμή ${formatMoney(amount)}.`;
}

export function formatLandingOutcome(squareName) {
  return hasText(squareName) ? `Προσγειώθηκες: ${squareName}.` : null;
}

/** Formats only the server-confirmed reward supplied for an actual Start landing. */
export function formatStartPassOutcome(amount = null) {
  const prefix = `Πέρασες από την ${GAMEPLAY_CONTENT.start}.`;
  return Number.isFinite(amount) ? `${prefix} Έλαβες ${formatMoney(amount)}!` : prefix;
}

export function formatJailExitOffer(amount) {
  return Number.isFinite(amount)
    ? `Πληρωμή ${formatMoney(amount)} για έξοδο από τη ${GAMEPLAY_CONTENT.jail} και ρίψη ζαριών;`
    : null;
}

function formatCardFact(fact) {
  if (!hasText(fact.playerName) || !hasText(fact.cardText)) return null;
  const category = formatCardCategory(fact.category);
  let result = `${fact.playerName}: ${category} — ${fact.cardText}`;
  if (Number.isFinite(fact.amount)) result += ` (${formatSignedMoney(fact.amount)})`;
  if (hasText(fact.destinationName)) result += ` Προορισμός: ${fact.destinationName}.`;
  return result;
}

export function formatCardCategory(category) {
  if (category === "Chance") return GAMEPLAY_CONTENT.chanceCard;
  if (category === "Community Chest") return GAMEPLAY_CONTENT.communityCard;
  return GAMEPLAY_CONTENT.genericCard;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}
