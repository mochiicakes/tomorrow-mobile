// warn - dev only, so release builds don't leak error details to logcat
export function warn(...args: unknown[]) {
  if (__DEV__) console.warn('[tomorrow]', ...args);
}
