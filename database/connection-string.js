export const splitConnectionStringPart = part => {
  const separator = part.indexOf('=');
  return separator === -1
    ? [part]
    : [part.slice(0, separator), part.slice(separator + 1)];
};
