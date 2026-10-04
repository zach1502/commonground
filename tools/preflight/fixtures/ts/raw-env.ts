// Fail fixture: reads the environment outside packages/config.
export function readFoo(): string | undefined {
  return process.env.FOO;
}
