export const sanitizeText = (raw, max = 15) =>
  raw
    .replace(/\s+/g, "")           // strip spaces/tabs/new-lines
    .replace(/[^A-Za-z0-9_]/g, "") // allow letters, digits, underscore only
    .slice(0, max);
