export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id });

  browser.tabs.create({
    url: 'https://apnews.com/article/trump-second-term-policies-immigration-economy-tariffs-f9d55c34a95054cd224a0b295d88fbde',
    active: true,
  }).catch((error: unknown) => {
    console.error('Failed to create tab:', error);
  });
  browser.tabs.query({}).then((tabs) => {
    if (tabs.length > 0 && tabs[0].id !== undefined) {
      browser.tabs.remove(tabs[0].id);
    }
  }).catch((error: unknown) => {
    console.error('Failed to remove tab:', error);
  });
});
