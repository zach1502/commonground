/** Source of uniform random numbers in the range [0, 1). */
export interface Random {
  next(): number;
}
