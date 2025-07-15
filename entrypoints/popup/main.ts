import './style.css';
import typescriptLogo from '@/assets/typescript.svg';
import viteLogo from '/wxt.svg';

// Add UI for article extraction
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div>
    <h1>WXT + TypeScript</h1>
    <div class="card">
      <button id="extract-article" type="button">Extract article text</button>
      <div id="article-result" style="margin-top:1em;text-align:left;"></div>
    </div>
  </div>
`;

// Add event listener for the extract button
const extractBtn = document.getElementById('extract-article')!;
const resultDiv = document.getElementById('article-result')!;
extractBtn.addEventListener('click', async () => {
  resultDiv.textContent = 'Extracting...';
  // Query the active tab
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) {
    resultDiv.textContent = 'No active tab found.';
    return;
  }
  // Send message to content script
  try {
    const response = await browser.tabs.sendMessage(tab.id, { action: 'extract-article-text' });
    if (response && response.content) {
      resultDiv.innerHTML = `<b>${response.title}</b><br><pre style='white-space:pre-wrap;'>${response.content}</pre>`;
    } else {
      resultDiv.textContent = 'Could not extract article text.';
    }
  } catch (err) {
    resultDiv.textContent = 'Could not extract article text (error sending message).';
    return;
  }
});
