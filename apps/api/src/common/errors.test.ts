import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from './errors.js';

describe('AppError', () => {
  it('sets statusCode, message, and code', () => {
    const err = new AppError(418, "I'm a teapot", 'TEAPOT');
    expect(err.statusCode).toBe(418);
    expect(err.message).toBe("I'm a teapot");
    expect(err.code).toBe('TEAPOT');
    expect(err.name).toBe('AppError');
  });

  it('is an instance of Error', () => {
    const err = new AppError(500, 'fail');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('NotFoundError', () => {
  it('produces a 404 with entity name and id', () => {
    const err = new NotFoundError('Customer', 'abc-123');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Customer with id abc-123 not found');
  });

  it('produces a 404 with entity name only', () => {
    const err = new NotFoundError('Ticket');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Ticket not found');
  });
});

describe('UnauthorizedError', () => {
  it('defaults to 401 / Unauthorized', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('Unauthorized');
  });

  it('accepts a custom message', () => {
    const err = new UnauthorizedError('Token expired');
    expect(err.message).toBe('Token expired');
  });
});

describe('ForbiddenError', () => {
  it('defaults to 403 / Forbidden', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('Forbidden');
  });
});

describe('ConflictError', () => {
  it('produces a 409', () => {
    const err = new ConflictError('Email already in use');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toBe('Email already in use');
  });
});

describe('ValidationError', () => {
  it('produces a 400', () => {
    const err = new ValidationError('Name is required');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Name is required');
  });
});
