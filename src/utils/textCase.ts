const TITLE_CASE_LETTER_REGEX = /(^|[\s\-_/([{"'`])([a-z])/g;

export const toDisplayTitleCase = (value: string): string => {
  if (!value) return value;
  return value.replace(
    TITLE_CASE_LETTER_REGEX,
    (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`
  );
};
