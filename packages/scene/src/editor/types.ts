export type ElementKind = 'item' | 'path' | 'area';

/** A reference to one element of the design; locked is set only on hit tests of locked ones. */
export interface ElementRef {
  readonly kind: ElementKind;
  readonly id: string;
  readonly locked?: 'locked';
}
