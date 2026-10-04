// Just enough JSX typing to lint the .tsx fixtures without a React dependency in this package.
declare namespace JSX {
  interface Element {
    readonly type: string;
  }
  type IntrinsicElements = Record<string, Record<string, unknown>>;
}
