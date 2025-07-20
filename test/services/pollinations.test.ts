/**
 * Unit tests for PollinationsService
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { PollinationsService } from '../../services/pollinations.js';
import { AnalysisErrorType, ExtensionError } from '../../types/index.js';

describe('PollinationsService', () => {
  let service: PollinationsService;
  let mockFetch: MockedFunction<typeof fetch>;

  const validApiResponse = {
    choices: [{
      message: {
        content: JSON.stringify({
          credibilityScore: 85,
          categories: {
            fact: 70,
            opinion: 20,
            false: 10
          },
          confidence: 90,
          reasoning: 'This content appears to be factual with some opinion elements.'
        })
      }
    }]
  };

  beforeEach(() => {
    service = new PollinationsService();
    mockFetch = vi.mocked(fetch);
    mockFetch.mockClear();
  });

  describe('analyzeText', () => {

    it('should successfully analyze valid text content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validApiResponse)
      } as Response);

      const result = await service.analyzeText(
        'This is a test article about climate change with factual information.',
        'https://example.com/article',
        'Test Article'
      );

      expect(result).toMatchObject({
        url: 'https://example.com/article',
        title: 'Test Article',
        credibilityScore: 85,
        categories: {
          fact: 70,
          opinion: 20,
          false: 10
        },
        confidence: 90,
        reasoning: 'This content appears to be factual with some opinion elements.'
      });

      expect(result.id).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.contentHash).toBeDefined();
    });

    it('should handle missing URL and title parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validApiResponse)
      } as Response);

      const result = await service.analyzeText('This is a valid content for analysis that is long enough to pass validation checks and should work properly.');

      expect(result.url).toBe('unknown');
      expect(result.title).toBe('Untitled Content');
    });

    it('should throw error for empty text content', async () => {
      await expect(service.analyzeText('')).rejects.toThrow(ExtensionError);
      await expect(service.analyzeText('   ')).rejects.toThrow(ExtensionError);
      
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw error for text content that is too short', async () => {
      await expect(service.analyzeText('Short')).rejects.toThrow(ExtensionError);
      
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should sanitize text content before analysis', async () => {
      const htmlContent = '<p>This is <strong>HTML</strong> content with   extra   spaces and enough text to pass validation requirements for analysis.</p>';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validApiResponse)
      } as Response);

      await service.analyzeText(htmlContent);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('This is HTML content with extra spaces and enough text to pass validation requirements for analysis.')
        })
      );
    });

    it('should handle API rate limiting (429 status)', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests'
      }));

      await expect(service.analyzeText('This is valid content for analysis that is long enough to pass validation checks and should work properly for testing API rate limiting.')).rejects.toThrow(ExtensionError);
    });

    it('should handle server errors (5xx status)', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Server Error', {
        status: 500,
        statusText: 'Internal Server Error'
      }));

      await expect(service.analyzeText('This is valid content for analysis that is long enough to pass validation checks and should work properly for testing server errors.')).rejects.toThrow(
        expect.objectContaining({
          type: AnalysisErrorType.API_UNAVAILABLE,
          retryable: true
        })
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(service.analyzeText('This is valid content for analysis that is long enough to pass validation checks and should work properly for testing network errors.')).rejects.toThrow(ExtensionError);
    });

    it('should handle invalid API response format', async () => {
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ invalid: 'response' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));

      await expect(service.analyzeText('This is valid content for analysis that is long enough to pass validation checks and should work properly for testing invalid API response format.')).rejects.toThrow(
        expect.objectContaining({
          type: AnalysisErrorType.API_UNAVAILABLE,
          retryable: true
        })
      );
    });

    it('should handle invalid JSON in API response content', async () => {
      const invalidJsonResponse = {
        choices: [{
          message: {
            content: 'Invalid JSON content'
          }
        }]
      };

      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(invalidJsonResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));

      await expect(service.analyzeText('This is valid content for analysis that is long enough to pass validation checks and should work properly for testing invalid JSON response.')).rejects.toThrow(
        expect.objectContaining({
          type: AnalysisErrorType.API_UNAVAILABLE,
          retryable: true
        })
      );
    });

    it('should retry failed requests up to maxRetries', async () => {
      // First two calls fail, third succeeds
      mockFetch
        .mockResolvedValueOnce(new Response('Server Error', {
          status: 500,
          statusText: 'Internal Server Error'
        }))
        .mockResolvedValueOnce(new Response('Server Error', {
          status: 500,
          statusText: 'Internal Server Error'
        }))
        .mockResolvedValueOnce(new Response(JSON.stringify(validApiResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));

      const result = await service.analyzeText('This is valid content for analysis that is long enough to pass validation checks and should work properly for testing retry functionality.');

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.credibilityScore).toBe(85);
    });

    it('should not retry non-retryable errors', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Bad Request', {
        status: 400,
        statusText: 'Bad Request'
      }));

      await expect(service.analyzeText('This is valid content for analysis that is long enough to pass validation checks and should work properly for testing non-retryable errors.')).rejects.toThrow();
      
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateApiResponse', () => {
    it('should validate correct API response format', () => {
      const validResponse = {
        choices: [{
          message: {
            content: 'some content'
          }
        }]
      };

      expect(service.validateApiResponse(validResponse)).toBe(true);
    });

    it('should reject invalid API response formats', () => {
      const invalidResponses = [
        null,
        undefined,
        {},
        { choices: [] },
        { choices: [{}] },
        { choices: [{ message: {} }] },
        { choices: [{ message: { content: null } }] }
      ];

      invalidResponses.forEach(response => {
        const result = service.validateApiResponse(response);
        expect(result).toBe(false);
      });
    });
  });

  describe('handleApiError', () => {
    it('should convert ExtensionError to AnalysisError', () => {
      const extensionError = new ExtensionError(
        AnalysisErrorType.NETWORK_ERROR,
        'Network failed',
        true,
        'Check connection'
      );

      const analysisError = service.handleApiError(extensionError);

      expect(analysisError).toEqual({
        type: AnalysisErrorType.NETWORK_ERROR,
        message: 'Network failed',
        retryable: true,
        suggestedAction: 'Check connection'
      });
    });

    it('should convert generic Error to AnalysisError', () => {
      const genericError = new Error('Something went wrong');

      const analysisError = service.handleApiError(genericError);

      expect(analysisError).toEqual({
        type: AnalysisErrorType.API_UNAVAILABLE,
        message: 'Something went wrong',
        retryable: true,
        suggestedAction: 'Please try again later'
      });
    });
  });

  describe('API request formatting', () => {
    it('should format API request correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                credibilityScore: 50,
                categories: { fact: 33, opinion: 33, false: 34 },
                confidence: 75,
                reasoning: 'Test reasoning'
              })
            }
          }]
        })
      } as Response);

      await service.analyzeText('This is test content for API formatting that is long enough to pass validation checks and should work properly.');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://text.pollinations.ai/',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: expect.stringContaining('"model":"openai"')
        })
      );

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1]?.body as string);
      
      expect(requestBody).toMatchObject({
        model: 'openai',
        prompt: expect.stringContaining('This is test content for API formatting that is long enough to pass validation checks and should work properly.'),
        system: expect.stringContaining('fact-checker')
      });
    });
  });

  describe('Enhanced Prompt Engineering', () => {
    beforeEach(() => {
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(validApiResponse)
      } as Response);
    });

    describe('Content Type Detection', () => {
      it('should detect social media content', async () => {
        const socialMediaContent = 'Just saw this amazing #breakthrough in @science! Can you believe it? 🧬';
        
        await service.analyzeText(socialMediaContent);
        
        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]?.body as string);
        
        expect(requestBody.prompt).toContain('Detected type: social-media');
        expect(requestBody.prompt).toContain('SOCIAL MEDIA ANALYSIS FOCUS');
        expect(requestBody.prompt).toContain('brevity and context limitations');
      });

      it('should detect news article content', async () => {
        const newsContent = 'According to sources familiar with the matter, the breaking news reported today indicates significant developments in the ongoing investigation.';
        
        await service.analyzeText(newsContent);
        
        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]?.body as string);
        
        expect(requestBody.prompt).toContain('Detected type: news-article');
        expect(requestBody.prompt).toContain('NEWS ARTICLE ANALYSIS FOCUS');
        expect(requestBody.prompt).toContain('source attribution and credibility');
      });

      it('should detect opinion piece content', async () => {
        const opinionContent = 'I believe that this editorial represents a significant shift in policy. In my opinion, the evidence suggests we should reconsider our approach to this important issue.';
        
        await service.analyzeText(opinionContent);
        
        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]?.body as string);
        
        expect(requestBody.prompt).toContain('Detected type: opinion-piece');
        expect(requestBody.prompt).toContain('OPINION PIECE ANALYSIS FOCUS');
        expect(requestBody.prompt).toContain('supported arguments and unsupported claims');
      });

      it('should detect scientific content', async () => {
        const scientificContent = 'The peer-reviewed study published in the journal examined the methodology used in previous research. The findings suggest that further investigation is needed to validate these results.';
        
        await service.analyzeText(scientificContent);
        
        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]?.body as string);
        
        expect(requestBody.prompt).toContain('Detected type: scientific-content');
        expect(requestBody.prompt).toContain('SCIENTIFIC CONTENT ANALYSIS FOCUS');
        expect(requestBody.prompt).toContain('methodology and peer review status');
      });

      it('should default to general content for unspecific text', async () => {
        const generalContent = 'This is some general content that does not fit into any specific category but is long enough for analysis purposes and testing.';
        
        await service.analyzeText(generalContent);
        
        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]?.body as string);
        
        expect(requestBody.prompt).toContain('Detected type: general-content');
        expect(requestBody.prompt).toContain('GENERAL CONTENT ANALYSIS FOCUS');
        expect(requestBody.prompt).toContain('standard fact-checking principles');
      });
    });

    describe('Content Metadata Analysis', () => {
      it('should include word count in analysis prompt', async () => {
        const content = 'This is a test content with exactly ten words for counting purposes.';
        
        await service.analyzeText(content);
        
        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]?.body as string);
        
        expect(requestBody.prompt).toContain('Word count: 12');
      });

      it('should detect URLs in content', async () => {
        const contentWithUrls = 'Check out this article at https://example.com/news and also visit https://another-site.org for more information about this important topic.';
        
        await service.analyzeText(contentWithUrls);
        
        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]?.body as string);
        
        expect(requestBody.prompt).toContain('Contains URLs: Yes');
      });

      it('should detect quotes in content', async () => {
        const contentWithQuotes = 'The expert said "this is a significant development" and added that "further research is needed" to understand the full implications.';
        
        await service.analyzeText(contentWithQuotes);
        
        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]?.body as string);
        
        expect(requestBody.prompt).toContain('Contains quotes: Yes');
      });

      it('should detect statistics and numbers', async () => {
        const contentWithNumbers = 'The study found that 85% of participants showed improvement, with an average increase of 23.5 points on the assessment scale.';
        
        await service.analyzeText(contentWithNumbers);
        
        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]?.body as string);
        
        expect(requestBody.prompt).toContain('Contains statistics: Yes');
      });

      it('should handle content without special features', async () => {
        const plainContent = 'This is plain text content without any special features like URLs quotes or statistics for testing purposes and validation.';
        
        await service.analyzeText(plainContent);
        
        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]?.body as string);
        
        expect(requestBody.prompt).toContain('Contains URLs: No');
        expect(requestBody.prompt).toContain('Contains quotes: No');
        expect(requestBody.prompt).toContain('Contains statistics: No');
      });
    });

    describe('System Prompt Enhancement', () => {
      it('should include comprehensive scoring guidelines', async () => {
        await service.analyzeText('Test content for system prompt validation that is long enough to pass all validation checks.');
        
        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]?.body as string);
        
        expect(requestBody.system).toContain('credibilityScore (0-100):');
        expect(requestBody.system).toContain('90-100: Highly credible');
        expect(requestBody.system).toContain('70-89: Generally credible');
        expect(requestBody.system).toContain('50-69: Mixed credibility');
        expect(requestBody.system).toContain('30-49: Low credibility');
        expect(requestBody.system).toContain('0-29: Highly unreliable');
      });

      it('should include detailed analysis criteria', async () => {
        await service.analyzeText('Test content for analysis criteria validation that is long enough to pass all validation checks.');
        
        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]?.body as string);
        
        expect(requestBody.system).toContain('ANALYSIS CRITERIA:');
        expect(requestBody.system).toContain('Source Attribution');
        expect(requestBody.system).toContain('Factual Accuracy');
        expect(requestBody.system).toContain('Logical Consistency');
        expect(requestBody.system).toContain('Bias Detection');
        expect(requestBody.system).toContain('Context Completeness');
        expect(requestBody.system).toContain('Language Analysis');
        expect(requestBody.system).toContain('Evidence Quality');
        expect(requestBody.system).toContain('Temporal Relevance');
      });

      it('should include content type considerations', async () => {
        await service.analyzeText('Test content for content type considerations validation that is long enough to pass all validation checks.');
        
        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]?.body as string);
        
        expect(requestBody.system).toContain('CONTENT TYPE CONSIDERATIONS:');
        expect(requestBody.system).toContain('News Articles: Focus on sourcing');
        expect(requestBody.system).toContain('Social Media Posts: Consider brevity');
        expect(requestBody.system).toContain('Opinion Pieces: Distinguish between supported arguments');
        expect(requestBody.system).toContain('Scientific Content: Evaluate methodology');
        expect(requestBody.system).toContain('Political Content: Assess for partisan bias');
      });

      it('should specify reasoning field requirements', async () => {
        await service.analyzeText('Test content for reasoning requirements validation that is long enough to pass all validation checks.');
        
        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1]?.body as string);
        
        expect(requestBody.system).toContain('reasoning field requirements:');
        expect(requestBody.system).toContain('Provide specific examples from the content');
        expect(requestBody.system).toContain('Explain the rationale behind category percentages');
        expect(requestBody.system).toContain('Maximum 300 words, minimum 100 words');
      });
    });

    describe('Prompt Effectiveness with Various Content Types', () => {
      const testCases = [
        {
          name: 'Factual news content',
          content: 'According to the World Health Organization, the new vaccine has shown 95% efficacy in clinical trials involving 30,000 participants across multiple countries.',
          expectedType: 'news-article',
          expectedFeatures: ['URLs: No', 'quotes: No', 'statistics: Yes']
        },
        {
          name: 'Misinformation content',
          content: 'Scientists are hiding the truth about vaccines! They contain microchips that track your every move. Wake up people! #conspiracy #truth',
          expectedType: 'social-media',
          expectedFeatures: ['URLs: No', 'quotes: No', 'statistics: No']
        },
        {
          name: 'Opinion with sources',
          content: 'I believe the recent study published in Nature (https://nature.com/article) provides compelling evidence. The researcher stated "this changes everything" about our understanding.',
          expectedType: 'opinion-piece',
          expectedFeatures: ['URLs: Yes', 'quotes: Yes', 'statistics: No']
        },
        {
          name: 'Scientific research',
          content: 'The peer-reviewed study examined 1,200 subjects using double-blind methodology. Results showed a 23.7% improvement with p-value < 0.001, indicating statistical significance.',
          expectedType: 'scientific-content',
          expectedFeatures: ['URLs: No', 'quotes: No', 'statistics: Yes']
        }
      ];

      testCases.forEach(({ name, content, expectedType, expectedFeatures }) => {
        it(`should properly analyze ${name}`, async () => {
          await service.analyzeText(content);
          
          const callArgs = mockFetch.mock.calls[0];
          const requestBody = JSON.parse(callArgs[1]?.body as string);
          
          expect(requestBody.prompt).toContain(`Detected type: ${expectedType}`);
          
          expectedFeatures.forEach(feature => {
            expect(requestBody.prompt).toContain(`Contains ${feature}`);
          });
          
          // Verify content-specific instructions are included
          expect(requestBody.prompt).toContain('ANALYSIS INSTRUCTIONS:');
          expect(requestBody.prompt).toContain('Examine each factual claim');
          expect(requestBody.prompt).toContain('Identify opinion statements');
          expect(requestBody.prompt).toContain('Look for potential misinformation');
        });
      });
    });
  });
});