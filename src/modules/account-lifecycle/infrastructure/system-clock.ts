import type { IClock } from '../ports/IClock';

export const systemClock: IClock = { now: () => new Date() };
