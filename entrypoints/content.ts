import { Readability } from '@mozilla/readability';

export default defineContentScript({
  matches: ['*://*/*'], // Run on all pages
  main() {
    // Listen for messages from the popup
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'extract-article-text') {
        // Extract article text using Readability
        const article = new Readability(document.cloneNode(true) as Document).parse();
        const response = {
          title: article?.title || '',
          content: article?.content || '',
        };
        sendResponse(response);
        return true;
      }
      return false;
    });
  },
});
