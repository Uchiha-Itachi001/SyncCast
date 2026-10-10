/**
 * High-performance in-memory sliding window rate limiter
 * Protects against denial-of-service, brute force, and resource exhaustion.
 */
export function createRateLimiter({ windowMs = 60 * 1000, maxRequests = 60, message = 'Too many requests, please try again later.' }) {
  const ipHits = new Map();

  // Periodic cleanup of stale IP records every 2 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of ipHits.entries()) {
      if (now - data.resetTime > windowMs) {
        ipHits.delete(ip);
      }
    }
  }, 2 * 60 * 1000);

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    let record = ipHits.get(ip);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      ipHits.set(ip, record);
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        error: message,
        retryAfterSeconds: retryAfter
      });
    }

    next();
  };
}
