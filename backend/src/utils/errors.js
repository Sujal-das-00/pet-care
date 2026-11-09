export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (msg = 'Bad request', details) => new HttpError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Unauthorized') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Forbidden') => new HttpError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found') => new HttpError(404, 'not_found', msg);
export const conflict = (msg = 'Conflict') => new HttpError(409, 'conflict', msg);
export const serviceUnavailable = (msg = 'Service unavailable') => new HttpError(503, 'unavailable', msg);
