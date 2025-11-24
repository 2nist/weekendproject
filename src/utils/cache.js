/**
 * Cache Management Utilities
 * Provides consistent caching patterns with size limits and invalidation
 */

class Cache {
  constructor(maxSize = 50, ttl = 5 * 60 * 1000) {
    // 5 minutes default TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  set(key, value, customTTL = null) {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: customTTL || this.ttl,
    });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    // Clean expired entries
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
    return this.cache.size;
  }

  keys() {
    return Array.from(this.cache.keys());
  }

  // Get cache stats
  getStats() {
    const now = Date.now();
    let valid = 0;
    let expired = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expired++;
      } else {
        valid++;
      }
    }

    return {
      total: this.cache.size,
      valid,
      expired,
      maxSize: this.maxSize,
    };
  }
}

// Global cache instances
export const analysisCache = new Cache(20, 10 * 60 * 1000); // 20 items, 10 minutes
export const projectCache = new Cache(10, 5 * 60 * 1000); // 10 items, 5 minutes
export const uiStateCache = new Cache(50, 30 * 60 * 1000); // 50 items, 30 minutes

/**
 * Cache invalidation helpers
 */
export const invalidateAnalysisCache = (fileHash = null) => {
  if (fileHash) {
    analysisCache.delete(fileHash);
  } else {
    analysisCache.clear();
  }
};

export const invalidateProjectCache = (projectId = null) => {
  if (projectId) {
    projectCache.delete(projectId);
  } else {
    projectCache.clear();
  }
};

export const invalidateAllCaches = () => {
  analysisCache.clear();
  projectCache.clear();
  uiStateCache.clear();
};

/**
 * React hook for cached async operations
 */
import { useState, useEffect, useCallback } from 'react';
import logger from '@/lib/logger';

export const useCachedAsync = (cache, cacheKey, asyncFn, deps = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(
    async (force = false) => {
      if (!force && cache.has(cacheKey)) {
        setData(cache.get(cacheKey));
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await asyncFn();
        cache.set(cacheKey, result);
        setData(result);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [cache, cacheKey, asyncFn],
  );

  useEffect(() => {
    execute();
  }, deps);

  const refetch = useCallback(() => execute(true), [execute]);

  return { data, loading, error, refetch };
};

/**
 * Memory usage monitoring
 */
export const getMemoryUsage = () => {
  if (typeof performance !== 'undefined' && performance.memory) {
    return {
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit,
      usagePercent: (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100,
    };
  }
  return null;
};

/**
 * Cache cleanup on low memory
 */
export const cleanupOnLowMemory = () => {
  const memory = getMemoryUsage();
  if (memory && memory.usagePercent > 80) {
    logger.warn('High memory usage detected, clearing caches');
    invalidateAllCaches();
    // Force garbage collection if available
    if (typeof gc !== 'undefined') {
      gc();
    }
  }
};

// Auto-cleanup on memory pressure
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    invalidateAllCaches();
  });
}
