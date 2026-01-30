import { describe, test, expect, spyOn, beforeEach, afterEach } from 'bun:test';
import {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationFailedError,
  handleApiError,
  type ValidationError,
} from './errors';

describe('ApiError', () => {
  describe('constructor', () => {
    test('sets code, message, and data properties', () => {
      const error = new ApiError(400, 'Test error', { field: { code: 'invalid', message: 'Field is invalid' } });

      expect(error.code).toBe(400);
      expect(error.message).toBe('Test error');
      expect(error.data).toEqual({ field: { code: 'invalid', message: 'Field is invalid' } });
    });

    test('defaults data to empty object', () => {
      const error = new ApiError(500, 'Test error');

      expect(error.data).toEqual({});
    });

    test('extends Error', () => {
      const error = new ApiError(400, 'Test error');

      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('toJSON()', () => {
    test('returns correct format { code, message, data }', () => {
      const error = new ApiError(400, 'Test error', { email: { code: 'required', message: 'Email is required' } });

      const json = error.toJSON();

      expect(json).toEqual({
        code: 400,
        message: 'Test error',
        data: { email: { code: 'required', message: 'Email is required' } },
      });
    });

    test('returns empty data object when no data provided', () => {
      const error = new ApiError(500, 'Server error');

      const json = error.toJSON();

      expect(json).toEqual({
        code: 500,
        message: 'Server error',
        data: {},
      });
    });
  });

  describe('toResponse()', () => {
    test('returns Response with correct status', async () => {
      const error = new ApiError(400, 'Bad request');

      const response = error.toResponse();

      expect(response.status).toBe(400);
    });

    test('returns Response with JSON body matching toJSON()', async () => {
      const error = new ApiError(400, 'Bad request', { name: { code: 'invalid', message: 'Name is invalid' } });

      const response = error.toResponse();
      const body = await response.json();

      expect(body).toEqual(error.toJSON());
    });
  });
});

describe('BadRequestError', () => {
  test('has correct status code 400', () => {
    const error = new BadRequestError();

    expect(error.code).toBe(400);
  });

  test('has correct default message', () => {
    const error = new BadRequestError();

    expect(error.message).toBe('Bad request');
  });

  test('can override message via constructor', () => {
    const error = new BadRequestError('Invalid JSON payload');

    expect(error.message).toBe('Invalid JSON payload');
  });

  test('can accept data parameter', () => {
    const error = new BadRequestError('Validation error', { field: { code: 'required', message: 'Field is required' } });

    expect(error.data).toEqual({ field: { code: 'required', message: 'Field is required' } });
  });

  test('instanceof ApiError returns true', () => {
    const error = new BadRequestError();

    expect(error).toBeInstanceOf(ApiError);
  });
});

describe('UnauthorizedError', () => {
  test('has correct status code 401', () => {
    const error = new UnauthorizedError();

    expect(error.code).toBe(401);
  });

  test('has correct default message', () => {
    const error = new UnauthorizedError();

    expect(error.message).toBe('Unauthorized');
  });

  test('can override message via constructor', () => {
    const error = new UnauthorizedError('Invalid token');

    expect(error.message).toBe('Invalid token');
  });

  test('instanceof ApiError returns true', () => {
    const error = new UnauthorizedError();

    expect(error).toBeInstanceOf(ApiError);
  });
});

describe('ForbiddenError', () => {
  test('has correct status code 403', () => {
    const error = new ForbiddenError();

    expect(error.code).toBe(403);
  });

  test('has correct default message', () => {
    const error = new ForbiddenError();

    expect(error.message).toBe('Forbidden');
  });

  test('can override message via constructor', () => {
    const error = new ForbiddenError('Admin access required');

    expect(error.message).toBe('Admin access required');
  });

  test('instanceof ApiError returns true', () => {
    const error = new ForbiddenError();

    expect(error).toBeInstanceOf(ApiError);
  });
});

describe('NotFoundError', () => {
  test('has correct status code 404', () => {
    const error = new NotFoundError();

    expect(error.code).toBe(404);
  });

  test('has correct default message', () => {
    const error = new NotFoundError();

    expect(error.message).toBe('Not found');
  });

  test('can override message via constructor', () => {
    const error = new NotFoundError('User not found');

    expect(error.message).toBe('User not found');
  });

  test('instanceof ApiError returns true', () => {
    const error = new NotFoundError();

    expect(error).toBeInstanceOf(ApiError);
  });
});

describe('ConflictError', () => {
  test('has correct status code 409', () => {
    const error = new ConflictError();

    expect(error.code).toBe(409);
  });

  test('has correct default message', () => {
    const error = new ConflictError();

    expect(error.message).toBe('Conflict');
  });

  test('can override message via constructor', () => {
    const error = new ConflictError('Email already exists');

    expect(error.message).toBe('Email already exists');
  });

  test('instanceof ApiError returns true', () => {
    const error = new ConflictError();

    expect(error).toBeInstanceOf(ApiError);
  });
});

describe('ValidationFailedError', () => {
  test('has correct status code 422', () => {
    const error = new ValidationFailedError();

    expect(error.code).toBe(422);
  });

  test('has correct default message', () => {
    const error = new ValidationFailedError();

    expect(error.message).toBe('Validation failed');
  });

  test('can override message via constructor', () => {
    const error = new ValidationFailedError('Invalid input');

    expect(error.message).toBe('Invalid input');
  });

  test('accepts data parameter with field errors', () => {
    const error = new ValidationFailedError('Validation failed', {
      email: { code: 'invalid_email', message: 'Invalid email format' },
      password: { code: 'too_short', message: 'Password must be at least 8 characters' },
    });

    expect(error.data).toEqual({
      email: { code: 'invalid_email', message: 'Invalid email format' },
      password: { code: 'too_short', message: 'Password must be at least 8 characters' },
    });
  });

  test('field errors appear in toJSON() output', () => {
    const fieldErrors: Record<string, ValidationError> = {
      name: { code: 'required', message: 'Name is required' },
    };
    const error = new ValidationFailedError('Validation failed', fieldErrors);

    const json = error.toJSON();

    expect(json.data).toEqual(fieldErrors);
  });

  test('instanceof ApiError returns true', () => {
    const error = new ValidationFailedError();

    expect(error).toBeInstanceOf(ApiError);
  });
});

describe('handleApiError()', () => {
  let originalNodeEnv: string | undefined;
  let originalBunbaseDev: string | undefined;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    originalNodeEnv = Bun.env.NODE_ENV;
    originalBunbaseDev = Bun.env.BUNBASE_DEV;
    // Suppress console.error output during tests
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    Bun.env.NODE_ENV = originalNodeEnv;
    Bun.env.BUNBASE_DEV = originalBunbaseDev;
    consoleErrorSpy.mockRestore();
  });

  describe('with ApiError', () => {
    test('returns correct response status', async () => {
      const error = new BadRequestError('Invalid input');

      const response = handleApiError(error);

      expect(response.status).toBe(400);
    });

    test('returns correct response body', async () => {
      const error = new NotFoundError('Resource not found');

      const response = handleApiError(error);
      const body = await response.json();

      expect(body).toEqual({
        code: 404,
        message: 'Resource not found',
        data: {},
      });
    });

    test('preserves validation data', async () => {
      const error = new ValidationFailedError('Validation failed', {
        email: { code: 'invalid', message: 'Invalid email' },
      });

      const response = handleApiError(error);
      const body = await response.json();

      expect(body.data).toEqual({
        email: { code: 'invalid', message: 'Invalid email' },
      });
    });
  });

  describe('with non-ApiError in production mode', () => {
    test('returns 500 status', async () => {
      Bun.env.NODE_ENV = 'production';
      Bun.env.BUNBASE_DEV = undefined;

      const response = handleApiError(new Error('Database connection failed'));

      expect(response.status).toBe(500);
    });

    test('returns generic message hiding internal details', async () => {
      Bun.env.NODE_ENV = 'production';
      Bun.env.BUNBASE_DEV = undefined;

      const response = handleApiError(new Error('SQL syntax error: SELECT * FROM users'));
      const body = await response.json();

      expect(body.message).toBe('Internal server error');
    });

    test('returns empty data object', async () => {
      Bun.env.NODE_ENV = 'production';
      Bun.env.BUNBASE_DEV = undefined;

      const response = handleApiError(new Error('Internal error'));
      const body = await response.json();

      expect(body.data).toEqual({});
    });
  });

  describe('with non-ApiError in development mode (NODE_ENV)', () => {
    test('includes error message for debugging', async () => {
      Bun.env.NODE_ENV = 'development';
      Bun.env.BUNBASE_DEV = undefined;

      const response = handleApiError(new Error('Database connection failed'));
      const body = await response.json();

      expect(body.message).toBe('Database connection failed');
    });

    test('still returns 500 status', async () => {
      Bun.env.NODE_ENV = 'development';
      Bun.env.BUNBASE_DEV = undefined;

      const response = handleApiError(new Error('Some error'));

      expect(response.status).toBe(500);
    });
  });

  describe('with non-ApiError in development mode (BUNBASE_DEV)', () => {
    test('includes error message when BUNBASE_DEV is true', async () => {
      Bun.env.NODE_ENV = 'production';
      Bun.env.BUNBASE_DEV = 'true';

      const response = handleApiError(new Error('Debug info here'));
      const body = await response.json();

      expect(body.message).toBe('Debug info here');
    });
  });

  describe('with non-Error objects', () => {
    test('handles string thrown as error', async () => {
      Bun.env.NODE_ENV = 'production';
      Bun.env.BUNBASE_DEV = undefined;

      const response = handleApiError('string error');
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.message).toBe('Internal server error');
    });

    test('handles null thrown as error', async () => {
      Bun.env.NODE_ENV = 'production';
      Bun.env.BUNBASE_DEV = undefined;

      const response = handleApiError(null);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.message).toBe('Internal server error');
    });

    test('handles undefined thrown as error', async () => {
      Bun.env.NODE_ENV = 'production';
      Bun.env.BUNBASE_DEV = undefined;

      const response = handleApiError(undefined);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.message).toBe('Internal server error');
    });
  });

  describe('logging', () => {
    test('logs unexpected errors to console', () => {
      const error = new Error('Unexpected database error');

      handleApiError(error);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Unhandled error:', error);
    });

    test('does not log ApiError instances', () => {
      const error = new BadRequestError('Expected error');

      handleApiError(error);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
