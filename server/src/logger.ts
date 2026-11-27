/** The subset of `console` the server logs through; inject a fake to silence or assert logs. */
export type Logger = Pick<Console, 'info' | 'error'>
