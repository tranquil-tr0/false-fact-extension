This extension will communicate with a backend running some derivative, a binary of the current code, or the release found at https://github.com/tranquil-tr0/false-fact-server. This backend will be referred to as BACKEND. This extension does not communicate with any other services.

When analysis of a page through the "Analyze Content" or similar button is triggered, the page content as processed by readability.js, title as processed by readability.js, url, and document.lastModified time will be sent to the BACKEND. The BACKEND may choose to cache this information and the analysis generated. The BACKEND may also send this information to an AI provider of choosing, and providers which may be used can be found in the BACKEND code.

When analysis of a selection is triggered through "Analyze Highlighted Text" or similar, the highlighted text will be sent for analysis to the BACKEND. The BACKEND may choose to retain this information as well.

This extension does not communicate an ID or any other identifying data other than already specified.
