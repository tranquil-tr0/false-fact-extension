import { Readability } from '@mozilla/readability';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Listen for messages from the popup
    browser.runtime.onMessage.addListener(async (message) => {
      if (message.action === 'extract-article') {
        const article = new Readability(document.cloneNode(true) as Document).parse();
        return Promise.resolve({
          title: article?.title || '',
          content: article?.textContent || '',
        });
      }
    });
  },
});
