import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../../src/middleware/errorHandler';

function makeReq(overrides: Partial<Request> = {}): Request {
  return { path: '/test', method: 'GET', ...overrides } as Request;
}

function makeRes(): jest.Mocked<Pick<Response, 'status' | 'json'>> & Response {
  const res = {} as any;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const next: NextFunction = jest.fn();

describe('errorHandler middleware', () => {
  it('responds with status 500', () => {
    const res = makeRes();
    errorHandler(new Error('boom'), makeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('responds with generic error key', () => {
    const res = makeRes();
    errorHandler(new Error('boom'), makeReq(), res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Internal server error' }),
    );
  });

  it('hides error message outside development', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = makeRes();
    errorHandler(new Error('secret'), makeReq(), res, next);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.message).toBeUndefined();
    process.env.NODE_ENV = prev;
  });

  it('exposes error message in development', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const res = makeRes();
    errorHandler(new Error('debug detail'), makeReq(), res, next);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.message).toBe('debug detail');
    process.env.NODE_ENV = prev;
  });
});
