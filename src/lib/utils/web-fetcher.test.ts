import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { taskFileService } from '@/services/task-file-service';
import * as utils from '../utils';
import { fetchWebContent, fetchWithJina, fetchWithTavily } from './web-fetcher';
import * as readabilityExtractorModule from './readability-extractor';

// Mock the fetchWithTimeout function
vi.mock('../utils', () => ({
  fetchWithTimeout: vi.fn(),
}));

const mockFetchWithTimeout = utils.fetchWithTimeout as Mock;

// Mock readability extractor
vi.mock('./readability-extractor', () => ({
  readabilityExtractor: {
    extract: vi.fn(),
  },
}));

vi.mock('@/services/task-file-service', () => ({
  taskFileService: {
    writeFile: vi.fn(),
  },
}));

const mockReadabilityExtract = readabilityExtractorModule.readabilityExtractor.extract as Mock;

// Set up environment variable for tests
const originalEnv = import.meta.env;

describe('web-fetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (import.meta as any).env = {
      ...originalEnv,
      VITE_TAVILY_API_KEY: 'test-api-key',
    };
  });

  describe('fetchWithJina', () => {
    it('should successfully fetch web content using Jina AI', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            title: 'Test Page',
            url: 'https://example.com',
            content: 'Test content',
            publishedDate: '2025-01-01',
          },
        }),
        text: vi.fn(),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);

      const result = await fetchWithJina('https://example.com');

      expect(result).toEqual({
        title: 'Test Page',
        url: 'https://example.com',
        content: 'Test content',
        publishedDate: '2025-01-01',
      });

      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        'https://r.jina.ai/https%3A%2F%2Fexample.com',
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        }
      );
    });

    it('should handle null publishedDate', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            title: 'Test Page',
            url: 'https://example.com',
            content: 'Test content',
            publishedDate: null,
          },
        }),
        text: vi.fn(),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);

      const result = await fetchWithJina('https://example.com');

      expect(result.publishedDate).toBeNull();
    });

    it('should throw error when response is not ok', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        text: vi.fn().mockResolvedValue('Not found'),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);

      await expect(fetchWithJina('https://example.com')).rejects.toThrow(
        'Jina fetch failed with status code: 404'
      );
    });

    it('should throw error when fetch fails', async () => {
      mockFetchWithTimeout.mockRejectedValue(new Error('Network error'));

      await expect(fetchWithJina('https://example.com')).rejects.toThrow('Network error');
    });
  });

  describe('fetchWithTavily', () => {
    it('should successfully fetch web content using Tavily', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [
            {
              url: 'https://example.com',
              raw_content: 'Test content from Tavily',
            },
          ],
        }),
        text: vi.fn(),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);

      const result = await fetchWithTavily('https://example.com');

      expect(result).toEqual({
        url: 'https://example.com',
        content: 'Test content from Tavily',
        title: undefined,
        publishedDate: null,
      });

      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        'https://api.tavily.com/extract',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            urls: ['https://example.com'],
            include_images: false,
          }),
        })
      );
    });

    it('should handle empty raw_content', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [
            {
              url: 'https://example.com',
              raw_content: '',
            },
          ],
        }),
        text: vi.fn(),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);

      const result = await fetchWithTavily('https://example.com');

      expect(result.content).toBe('');
    });

    it('should throw error when no results returned', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [],
        }),
        text: vi.fn(),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);

      await expect(fetchWithTavily('https://example.com')).rejects.toThrow(
        'No results returned from Tavily API'
      );
    });

    it('should throw error when response is not ok', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized'),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);

      await expect(fetchWithTavily('https://example.com')).rejects.toThrow(
        'Tavily fetch failed with status code: 401'
      );
    });
  });

  describe('fetchWebContent', () => {
    it('should successfully fetch with Jina AI (primary method)', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            title: 'Test Page',
            url: 'https://example.com',
            content: 'Test content',
            publishedDate: null,
          },
        }),
        text: vi.fn(),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);

      const result = await fetchWebContent('https://example.com');

      expect(result.title).toBe('Test Page');
      expect(result.content).toBe('Test content');
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        'https://r.jina.ai/https%3A%2F%2Fexample.com',
        expect.any(Object)
      );
    });

    it('should save content to task file when content exceeds limit', async () => {
      const longContent = 'a'.repeat(10001);
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            title: 'Test Page',
            url: 'https://example.com',
            content: longContent,
            publishedDate: null,
          },
        }),
        text: vi.fn(),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);
      (taskFileService.writeFile as Mock).mockResolvedValue('/test/root/.talkcody/tool/task-1/tool_web-fetch.txt');

      const result = await fetchWebContent('https://example.com', {
        taskId: 'task-1',
        toolId: 'tool',
      });

      expect(taskFileService.writeFile).toHaveBeenCalledWith(
        'tool',
        'task-1',
        'tool_web-fetch.txt',
        longContent
      );
      expect(result.filePath).toBe('/test/root/.talkcody/tool/task-1/tool_web-fetch.txt');
      expect(result.content).toContain('saved to');
      expect(result.content).toContain('grep');
      expect(result.truncated).toBe(true);
      expect(result.contentLength).toBe(10001);
    });

    it('should truncate content when task context is missing', async () => {
      const longContent = 'b'.repeat(10001);
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            title: 'Test Page',
            url: 'https://example.com',
            content: longContent,
            publishedDate: null,
          },
        }),
        text: vi.fn(),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);

      const result = await fetchWebContent('https://example.com');

      expect(result.truncated).toBe(true);
      expect(result.contentLength).toBe(10001);
      expect(result.content).toContain('Returning first 10000 characters');
      expect(result.content).toContain(longContent.slice(0, 10000));
    });

    it('should fallback to Readability when Jina fails', async () => {
      // First call (Jina) fails
      const jinaErrorResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Server error'),
      };

      mockFetchWithTimeout.mockResolvedValueOnce(jinaErrorResponse as any);

      // Readability succeeds
      mockReadabilityExtract.mockResolvedValueOnce({
        title: 'Readability Title',
        content: 'Content from Readability fallback',
        url: 'https://example.com',
      });

      const result = await fetchWebContent('https://example.com');

      expect(result.content).toBe('Content from Readability fallback');
      expect(result.title).toBe('Readability Title');
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1); // Only Jina
      expect(mockReadabilityExtract).toHaveBeenCalledTimes(1);
    });

    it('should fallback to Tavily when Jina and Readability fail', async () => {
      // First call (Jina) fails
      const jinaErrorResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Server error'),
      };

      // Third call (Tavily) succeeds
      const tavilySuccessResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [
            {
              url: 'https://example.com',
              raw_content: 'Content from Tavily fallback',
            },
          ],
        }),
        text: vi.fn(),
      };

      mockFetchWithTimeout
        .mockResolvedValueOnce(jinaErrorResponse as any)
        .mockResolvedValueOnce(tavilySuccessResponse as any);

      // Readability fails
      mockReadabilityExtract.mockResolvedValueOnce(null);

      const result = await fetchWebContent('https://example.com');

      expect(result.content).toBe('Content from Tavily fallback');
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2); // Jina + Tavily
      expect(mockReadabilityExtract).toHaveBeenCalledTimes(1);
    });

    it('should throw error when Jina, Readability and Tavily all fail', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Server error'),
      };

      mockFetchWithTimeout.mockResolvedValue(mockErrorResponse as any);
      mockReadabilityExtract.mockResolvedValue(null);

      await expect(fetchWebContent('https://example.com')).rejects.toThrow(
        'Failed to fetch web content'
      );

      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2); // Jina + Tavily
      expect(mockReadabilityExtract).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid URL (no http)', async () => {
      await expect(fetchWebContent('example.com')).rejects.toThrow('Invalid URL provided');

      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    it('should throw error for empty URL', async () => {
      await expect(fetchWebContent('')).rejects.toThrow('Invalid URL provided');

      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    it('should accept https URLs', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            title: 'Test',
            url: 'https://example.com',
            content: 'Content',
            publishedDate: null,
          },
        }),
        text: vi.fn(),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);

      await expect(fetchWebContent('https://example.com')).resolves.toBeDefined();
    });

    it('should accept http URLs', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            title: 'Test',
            url: 'http://example.com',
            content: 'Content',
            publishedDate: null,
          },
        }),
        text: vi.fn(),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);

      await expect(fetchWebContent('http://example.com')).resolves.toBeDefined();
    });
  });
});
