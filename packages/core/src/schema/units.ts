import { z } from 'zod';

const PERCENT_MAX = 100;

// z.number() in zod 4 already rejects NaN and the infinities.
export const metresSchema = z.number().brand<'Metres'>();
export const positiveMetresSchema = z.number().positive().brand<'Metres'>();
export const squareMetresSchema = z.number().nonnegative().brand<'SquareMetres'>();
export const cubicMetresSchema = z.number().nonnegative().brand<'CubicMetres'>();
export const cadSchema = z.number().nonnegative().brand<'Cad'>();
export const percentSchema = z.number().min(0).max(PERCENT_MAX).brand<'Percent'>();
/** Rise over run, so 0.05 is a 5 percent grade. */
export const slopeSchema = z.number().nonnegative().brand<'Slope'>();

export type Metres = z.infer<typeof metresSchema>;
export type SquareMetres = z.infer<typeof squareMetresSchema>;
export type CubicMetres = z.infer<typeof cubicMetresSchema>;
export type Cad = z.infer<typeof cadSchema>;
export type Percent = z.infer<typeof percentSchema>;
export type Slope = z.infer<typeof slopeSchema>;

export const metres = (value: number): Metres => metresSchema.parse(value);
export const squareMetres = (value: number): SquareMetres => squareMetresSchema.parse(value);
export const cubicMetres = (value: number): CubicMetres => cubicMetresSchema.parse(value);
export const cad = (value: number): Cad => cadSchema.parse(value);
export const percent = (value: number): Percent => percentSchema.parse(value);
export const slope = (value: number): Slope => slopeSchema.parse(value);

export function sumCad(amounts: readonly Cad[]): Cad {
  return cad(amounts.reduce((total, amount) => total + amount, 0));
}
