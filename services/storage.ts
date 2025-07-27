/**
 * Storage management service for caching analysis results and user preferences
 */

import type { AnalysisResult } from '../types/index.js';
import { generateContentHash } from '../utils/index.js';

// Re-export types for convenience
export type { AnalysisResult } from '../types/index.js';

export interface CacheEntry {
  result: AnalysisResult;
  timestamp: number;
  url: string;
  accessCount: number;
  lastAccessed: number;
}

export interface UserPreferences {
  autoAnalyze: boolean;
  cacheEnabled: boolean;
  maxCacheSize: number;
  cacheExpiryHours: number;
  showNotifications: boolean;
  analysisTimeout: number;
}

export interface StorageStats {
  totalEntries: number;
  totalSize: number;
  oldestEntry: number;
  newestEntry: number;
  hitRate: number;
}

/**
 * Storage manager for handling cache and user preferences
 */
export class StorageManager {
  private readonly cachePrefix = 'analysis_';
  private readonly urlPrefix = 'url_';
  private readonly prefsKey = 'user_preferences';
  private readonly statsKey = 'cache_stats';
  
  private readonly defaultPreferences: UserPreferences = {
    autoAnalyze: false,
    cacheEnabled: true,
    maxCacheSize: 100, // Maximum number of cached results
    cacheExpiryHours: 24, // Cache expiry in hours
    showNotifications: true,
    analysisTimeout: 30000 // 30 seconds
  };

  /**
   * Caches an analysis result with metadata
   */
  async cacheResult(url: string, result: AnalysisResult): Promise<void> {
    console.log('[storage] cacheResult called:', { url, result });
    const preferences = await this.getUserPreferences();
    console.log('[storage] cacheResult preferences:', preferences);

    if (!preferences.cacheEnabled) {
      console.log('[storage] cacheResult: cache disabled');
      return;
    }

    try {
      const cacheKey = `${this.cachePrefix}${result.contentHash}`;
      const urlKey = `${this.urlPrefix}${this.hashUrl(url)}`;
      console.log('[storage] cacheResult keys:', { cacheKey, urlKey });

      const cacheEntry: CacheEntry = {
        result,
        timestamp: Date.now(),
        url,
        accessCount: 1,
        lastAccessed: Date.now()
      };

      // Store the cache entry
      console.log('[storage] Setting cache entry:', cacheKey, cacheEntry);
      await browser.storage.local.set({ [cacheKey]: cacheEntry });

      // Store URL mapping for quick lookup
      console.log('[storage] Setting url mapping:', urlKey, cacheKey);
      await browser.storage.local.set({ [urlKey]: cacheKey });

      // Update cache statistics
      await this.updateCacheStats('add');
      // Perform cache cleanup if needed
      await this.performCacheCleanup();

      console.log('[storage] cacheResult completed');
    } catch (error) {
      console.warn('[storage] Failed to cache analysis result:', error);
      // Don't throw error for caching failures
    }
  }

  /**
   * Retrieves cached analysis result by URL
   */
  async getCachedResult(url: string): Promise<AnalysisResult | null> {
    console.log('[storage] getCachedResult called:', url);
    const preferences = await this.getUserPreferences();
    console.log('[storage] getCachedResult preferences:', preferences);

    if (!preferences.cacheEnabled) {
      console.log('[storage] getCachedResult: cache disabled');
      return null;
    }

    try {
      const urlKey = `${this.urlPrefix}${this.hashUrl(url)}`;
      const urlMapping = await browser.storage.local.get(urlKey);
      console.log('[storage] getCachedResult urlMapping:', urlMapping);

      if (!urlMapping[urlKey]) {
        console.log('[storage] getCachedResult: no url mapping');
        return null;
      }

      const cacheKey = urlMapping[urlKey];
      const cacheData = await browser.storage.local.get(cacheKey);
      console.log('[storage] getCachedResult cacheData:', cacheData);

      if (!cacheData[cacheKey]) {
        console.log('[storage] getCachedResult: no cache data, removing urlKey');
        await browser.storage.local.remove(urlKey);
        return null;
      }

      const cacheEntry: CacheEntry = cacheData[cacheKey];
      const cacheAge = Date.now() - cacheEntry.timestamp;
      const maxAge = preferences.cacheExpiryHours * 60 * 60 * 1000;
      console.log('[storage] getCachedResult cacheEntry:', cacheEntry, 'cacheAge:', cacheAge, 'maxAge:', maxAge);

      if (cacheAge > maxAge) {
        console.log('[storage] getCachedResult: cache expired, removing');
        await this.removeCacheEntry(cacheKey, urlKey);
        return null;
      }

      cacheEntry.accessCount++;
      cacheEntry.lastAccessed = Date.now();
      await browser.storage.local.set({ [cacheKey]: cacheEntry });

      await this.updateCacheStats('hit');
      console.log('[storage] getCachedResult returning result');
      return cacheEntry.result;

    } catch (error) {
      console.warn('[storage] Failed to retrieve cached result:', error);
      return null;
    }
  }

  /**
   * Retrieves cached result by content hash
   */
  async getCachedResultByHash(contentHash: string): Promise<AnalysisResult | null> {
    const preferences = await this.getUserPreferences();
    
    if (!preferences.cacheEnabled) {
      return null;
    }

    try {
      const cacheKey = `${this.cachePrefix}${contentHash}`;
      const cacheData = await browser.storage.local.get(cacheKey);
      
      if (!cacheData[cacheKey]) {
        return null;
      }

      const cacheEntry: CacheEntry = cacheData[cacheKey];
      
      // Check if cache is still valid
      const cacheAge = Date.now() - cacheEntry.timestamp;
      const maxAge = preferences.cacheExpiryHours * 60 * 60 * 1000;
      
      if (cacheAge > maxAge) {
        // Clean up expired cache
        const urlKey = `${this.urlPrefix}${this.hashUrl(cacheEntry.url)}`;
        await this.removeCacheEntry(cacheKey, urlKey);
        return null;
      }

      // Update access statistics
      cacheEntry.accessCount++;
      cacheEntry.lastAccessed = Date.now();
      await browser.storage.local.set({ [cacheKey]: cacheEntry });

      return cacheEntry.result;

    } catch (error) {
      console.warn('Failed to retrieve cached result by hash:', error);
      return null;
    }
  }

  /**
   * Gets user preferences with defaults
   */
  async getUserPreferences(): Promise<UserPreferences> {
    try {
      const stored = await browser.storage.local.get(this.prefsKey);
      
      if (!stored[this.prefsKey]) {
        // Initialize with defaults
        await this.setUserPreferences(this.defaultPreferences);
        return this.defaultPreferences;
      }

      // Merge with defaults to handle new preference keys
      return {
        ...this.defaultPreferences,
        ...stored[this.prefsKey]
      };

    } catch (error) {
      console.warn('Failed to get user preferences:', error);
      return this.defaultPreferences;
    }
  }

  /**
   * Sets user preferences
   */
  async setUserPreferences(preferences: Partial<UserPreferences>): Promise<void> {
    try {
      const current = await this.getUserPreferences();
      const updated = { ...current, ...preferences };
      
      await browser.storage.local.set({ [this.prefsKey]: updated });

    } catch (error) {
      console.error('Failed to set user preferences:', error);
      throw error;
    }
  }

  /**
   * Gets cache statistics
   */
  async getCacheStats(): Promise<StorageStats> {
    try {
      const stored = await browser.storage.local.get(this.statsKey);
      
      if (!stored[this.statsKey]) {
        const defaultStats: StorageStats = {
          totalEntries: 0,
          totalSize: 0,
          oldestEntry: 0,
          newestEntry: 0,
          hitRate: 0
        };
        
        await browser.storage.local.set({ [this.statsKey]: defaultStats });
        return defaultStats;
      }

      return stored[this.statsKey];

    } catch (error) {
      console.warn('Failed to get cache stats:', error);
      return {
        totalEntries: 0,
        totalSize: 0,
        oldestEntry: 0,
        newestEntry: 0,
        hitRate: 0
      };
    }
  }

  /**
   * Performs cache cleanup based on size and age limits
   */
  async performCacheCleanup(): Promise<void> {
    const preferences = await this.getUserPreferences();
    
    if (!preferences.cacheEnabled) {
      return;
    }

    try {
      // Get all cache entries
      const allData = await browser.storage.local.get();
      const cacheEntries: Array<{ key: string; entry: CacheEntry }> = [];
      
      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith(this.cachePrefix) && this.isCacheEntry(value)) {
          cacheEntries.push({ key, entry: value as CacheEntry });
        }
      }

      // Check if cleanup is needed
      if (cacheEntries.length <= preferences.maxCacheSize) {
        return;
      }

      // Sort by last accessed time (oldest first) and access count (least used first)
      cacheEntries.sort((a, b) => {
        const accessDiff = a.entry.accessCount - b.entry.accessCount;
        if (accessDiff !== 0) return accessDiff;
        return a.entry.lastAccessed - b.entry.lastAccessed;
      });

      // Remove excess entries
      const entriesToRemove = cacheEntries.length - preferences.maxCacheSize;
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < entriesToRemove; i++) {
        const entry = cacheEntries[i];
        keysToRemove.push(entry.key);
        
        // Also remove URL mapping
        const urlKey = `${this.urlPrefix}${this.hashUrl(entry.entry.url)}`;
        keysToRemove.push(urlKey);
      }

      if (keysToRemove.length > 0) {
        await browser.storage.local.remove(keysToRemove);
        await this.updateCacheStats('cleanup', entriesToRemove);
      }

    } catch (error) {
      console.warn('Failed to perform cache cleanup:', error);
    }
  }

  /**
   * Clears all cached data
   */
  async clearCache(): Promise<void> {
    try {
      const allData = await browser.storage.local.get();
      const keysToRemove: string[] = [];
      
      for (const key of Object.keys(allData)) {
        if (key.startsWith(this.cachePrefix) || key.startsWith(this.urlPrefix)) {
          keysToRemove.push(key);
        }
      }

      if (keysToRemove.length > 0) {
        await browser.storage.local.remove(keysToRemove);
      }

      // Reset cache statistics
      const resetStats: StorageStats = {
        totalEntries: 0,
        totalSize: 0,
        oldestEntry: 0,
        newestEntry: 0,
        hitRate: 0
      };
      
      await browser.storage.local.set({ [this.statsKey]: resetStats });

    } catch (error) {
      console.error('Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * Gets storage usage information
   */
  async getStorageUsage(): Promise<{ used: number; quota: number; percentage: number }> {
    try {
      const usage = await browser.storage.local.getBytesInUse();
      const quota = browser.storage.local.QUOTA_BYTES || 5242880; // 5MB default
      
      return {
        used: usage,
        quota: quota,
        percentage: (usage / quota) * 100
      };

    } catch (error) {
      console.warn('Failed to get storage usage:', error);
      return { used: 0, quota: 5242880, percentage: 0 };
    }
  }

  /**
   * Exports cache data for backup
   */
  async exportCacheData(): Promise<string> {
    try {
      const allData = await browser.storage.local.get();
      const cacheData: Record<string, any> = {};
      
      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith(this.cachePrefix) || 
            key.startsWith(this.urlPrefix) || 
            key === this.prefsKey) {
          cacheData[key] = value;
        }
      }

      return JSON.stringify(cacheData, null, 2);

    } catch (error) {
      console.error('Failed to export cache data:', error);
      throw error;
    }
  }

  /**
   * Imports cache data from backup
   */
  async importCacheData(jsonData: string): Promise<void> {
    try {
      const data = JSON.parse(jsonData);
      
      // Validate data structure
      if (typeof data !== 'object' || data === null) {
        throw new Error('Invalid cache data format');
      }

      // Clear existing cache first
      await this.clearCache();
      
      // Import data
      await browser.storage.local.set(data);

    } catch (error) {
      console.error('Failed to import cache data:', error);
      throw error;
    }
  }

  /**
   * Removes a specific cache entry
   */
  private async removeCacheEntry(cacheKey: string, urlKey: string): Promise<void> {
    try {
      await browser.storage.local.remove([cacheKey, urlKey]);
      await this.updateCacheStats('remove');
    } catch (error) {
      console.warn('Failed to remove cache entry:', error);
    }
  }

  /**
   * Updates cache statistics
   */
  private async updateCacheStats(
    operation: 'add' | 'hit' | 'remove' | 'cleanup',
    count: number = 1
  ): Promise<void> {
    try {
      const stats = await this.getCacheStats();
      const now = Date.now();

      switch (operation) {
        case 'add':
          stats.totalEntries += count;
          stats.totalSize += count;
          if (stats.oldestEntry === 0) stats.oldestEntry = now;
          stats.newestEntry = now;
          break;

        case 'hit':
          // Hit rate calculation would need more sophisticated tracking
          break;

        case 'remove':
        case 'cleanup':
          stats.totalEntries = Math.max(0, stats.totalEntries - count);
          stats.totalSize = Math.max(0, stats.totalSize - count);
          break;
      }

      await browser.storage.local.set({ [this.statsKey]: stats });

    } catch (error) {
      console.warn('Failed to update cache stats:', error);
    }
  }

  /**
   * Type guard for cache entries
   */
  private isCacheEntry(value: any): value is CacheEntry {
    return value && 
           typeof value === 'object' &&
           'result' in value &&
           'timestamp' in value &&
           'url' in value &&
           'accessCount' in value &&
           'lastAccessed' in value;
  }

  /**
   * Creates hash for URL caching
   */
  private hashUrl(url: string): string {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

// Export singleton instance
export const storageManager = new StorageManager();