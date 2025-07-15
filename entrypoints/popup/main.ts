import './style.css';
import typescriptLogo from '@/assets/typescript.svg';
import viteLogo from '/wxt.svg';
import { setupCounter } from '@/components/counter';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <button id="extract-article" type="button">Extract Article Text</button>
  </div>
`;

document.querySelector<HTMLButtonElement>('#extract-article')?.addEventListener('click', async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) return;
  const result = await browser.tabs.sendMessage(tab.id, { action: 'extract-article' });
  const articleDiv = document.createElement('div');
  articleDiv.style.marginTop = '1em';
  articleDiv.innerHTML = `<h2>${result.title}</h2><pre style="white-space: pre-wrap;">${result.content}</pre>`;
  document.querySelector<HTMLDivElement>('#app')?.appendChild(articleDiv);
});
