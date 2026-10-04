/** Thrown by loaders for a missing page or record; the error page shows "Page not found". */
export class NotFoundError extends Error {
  constructor() {
    super('Not found');
    this.name = 'NotFoundError';
  }
}
