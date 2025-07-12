# Development Guide

## Setting Up Development Environment

1. **Prerequisites**
   - Modern web browser (Chrome, Firefox, Edge)
   - Text editor or IDE (VS Code recommended)
   - Basic knowledge of JavaScript and web APIs

2. **Local Development**
   ```bash
   # Clone the repository
   git clone https://github.com/yourusername/is-this-real-extension.git
   cd is-this-real-extension
   
   # No build process required - extension can be loaded directly
   ```

3. **Loading in Browser**
   
   **Chrome/Edge:**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension directory
   
   **Firefox:**
   - Navigate to `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on"
   - Select `manifest.json`

## Architecture Overview

### Core Components

1. **Manifest V3 (`manifest.json`)**
   - Extension configuration and permissions
   - Service worker and content script registration
   - Browser action and icon definitions

2. **Service Worker (`background.js`)**
   - Handles extension lifecycle events
   - Manages background analysis tasks
   - Coordinates between popup and content scripts
   - Handles storage and caching

3. **Popup Interface (`popup.html`, `popup.js`)**
   - User interface for manual fact-checking
   - Displays analysis results and settings
   - Handles user interactions and preferences

4. **Content Scripts (`content.js`, `content.css`)**
   - Injected into web pages
   - Extracts article content and metadata
   - Displays overlays and visual indicators
   - Handles keyboard shortcuts

### Data Flow

```
Web Page Content → Content Script → Background Service Worker
                                          ↓
                               Analysis Engine
                                          ↓
                    Results → Storage → Popup Interface
                                          ↓
                                    User Display
```

## Key Features Implementation

### Content Extraction

The extension uses a multi-strategy approach to extract article content:

1. **Semantic HTML Analysis**: Looks for `<article>`, `<main>`, and other semantic elements
2. **Class-based Detection**: Searches for common content class names
3. **Fallback Extraction**: Collects paragraph content when semantic methods fail
4. **Metadata Extraction**: Finds author, publication date, and other metadata

### Credibility Analysis

Current heuristic-based analysis includes:

- **Domain Reputation**: Checks against known trusted/untrusted sources
- **Language Analysis**: Detects sensational or emotional language patterns
- **Content Structure**: Evaluates article length and organization
- **Source Citations**: Looks for references to sources and experts
- **Metadata Quality**: Checks for author attribution and publication dates

### Scoring Algorithm

```javascript
// Simplified scoring logic
let credibilityScore = 0.5; // Base score

// Domain reputation (+/-0.3)
if (trustedDomain) credibilityScore += 0.3;
if (questionableDomain) credibilityScore -= 0.3;

// Content quality (+/-0.2)
if (hasSourceCitations) credibilityScore += 0.2;
if (excessiveEmotionalLanguage) credibilityScore -= 0.2;

// Structure assessment (+/-0.1)
if (substantialContent) credibilityScore += 0.1;
if (tooShort) credibilityScore -= 0.1;

// Convert to 0-100 scale
const finalScore = Math.round(credibilityScore * 100);
```

## Adding New Features

### 1. New Analysis Criteria

To add a new credibility indicator:

1. **Update Analysis Function** (`background.js`):
   ```javascript
   // Add new check in performAnalysis()
   if (newCriteriaCheck(content)) {
     credibilityScore += 0.1;
     positives.push('New positive indicator found');
   }
   ```

2. **Test the Implementation**:
   - Load extension in browser
   - Test on various articles
   - Verify scoring changes are appropriate

### 2. New UI Components

To add new popup interface elements:

1. **Update HTML** (`popup.html`):
   ```html
   <div class="new-feature">
     <button id="newFeatureBtn">New Feature</button>
   </div>
   ```

2. **Add JavaScript Logic** (`popup.js`):
   ```javascript
   // In FactChecker constructor
   this.newFeatureBtn = document.getElementById('newFeatureBtn');
   this.newFeatureBtn.addEventListener('click', () => this.handleNewFeature());
   ```

3. **Style the Component** (`popup.html` styles or separate CSS):
   ```css
   .new-feature {
     margin-top: 12px;
     padding: 8px;
   }
   ```

### 3. External API Integration

To integrate with fact-checking APIs:

1. **Add API Configuration**:
   ```javascript
   const API_CONFIG = {
     endpoint: 'https://factcheck-api.example.com',
     apiKey: 'your-api-key' // Store in extension storage
   };
   ```

2. **Update Analysis Function**:
   ```javascript
   async analyzeWithAPI(content) {
     const response = await fetch(API_CONFIG.endpoint, {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${API_CONFIG.apiKey}`,
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({ content })
     });
     
     return await response.json();
   }
   ```

3. **Handle Errors and Fallbacks**:
   ```javascript
   try {
     const apiResult = await this.analyzeWithAPI(content);
     return apiResult;
   } catch (error) {
     console.warn('API analysis failed, using local analysis');
     return this.performLocalAnalysis(content);
   }
   ```

## Testing Guidelines

### Manual Testing

1. **Content Extraction Testing**:
   - Test on various news sites (CNN, BBC, Reuters, etc.)
   - Test on blog platforms (Medium, WordPress)
   - Test on social media embedded articles
   - Verify content quality and completeness

2. **Analysis Accuracy Testing**:
   - Test on known reliable sources
   - Test on known unreliable sources
   - Test on borderline/questionable content
   - Verify scoring makes sense

3. **UI/UX Testing**:
   - Test popup functionality
   - Test overlay display and positioning
   - Test keyboard shortcuts
   - Test on different screen sizes

### Browser Compatibility Testing

Test the extension on:
- Chrome (latest + previous major version)
- Firefox (latest + ESR)
- Edge (latest)
- Safari (if targeting Safari)

### Performance Testing

1. **Memory Usage**: Monitor extension memory consumption
2. **Page Load Impact**: Ensure content scripts don't slow page loading
3. **Analysis Speed**: Verify analysis completes in reasonable time
4. **Storage Usage**: Monitor local storage consumption

## Code Style Guidelines

### JavaScript

- Use modern ES6+ features
- Prefer `const` and `let` over `var`
- Use async/await for asynchronous operations
- Add JSDoc comments for functions
- Handle errors gracefully

```javascript
/**
 * Analyzes article content for credibility indicators
 * @param {Object} content - Extracted article content
 * @param {string} content.title - Article title
 * @param {string} content.body - Article body text
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeContent(content) {
  try {
    // Implementation
  } catch (error) {
    console.error('Analysis failed:', error);
    throw new Error('Unable to analyze content');
  }
}
```

### HTML/CSS

- Use semantic HTML elements
- Follow accessibility guidelines (ARIA labels, keyboard navigation)
- Use CSS custom properties for theming
- Ensure responsive design
- Test with high contrast modes

### Git Workflow

1. **Branch Naming**:
   - Features: `feature/description`
   - Fixes: `fix/description`
   - Docs: `docs/description`

2. **Commit Messages**:
   ```
   type(scope): description
   
   Examples:
   feat(analysis): add domain reputation checking
   fix(popup): resolve overlay positioning issue
   docs(readme): update installation instructions
   ```

3. **Pull Request Process**:
   - Create feature branch from main
   - Make changes and test thoroughly
   - Update documentation if needed
   - Submit PR with clear description
   - Address review feedback

## Debugging Tips

### Browser DevTools

1. **Extension Debugging**:
   - Open `chrome://extensions/`
   - Find your extension and click "Inspect views: service worker"
   - Use console for background script debugging

2. **Content Script Debugging**:
   - Open DevTools on any page
   - Content script logs appear in page console
   - Use "Sources" tab to set breakpoints

3. **Popup Debugging**:
   - Right-click extension icon → "Inspect popup"
   - Separate DevTools window opens for popup

### Common Issues

1. **Content Script Not Injecting**:
   - Check manifest.json matches patterns
   - Verify permissions are sufficient
   - Check for JavaScript errors

2. **Background Script Not Working**:
   - Check service worker registration
   - Look for errors in service worker console
   - Verify event listeners are properly registered

3. **Storage Issues**:
   - Check storage permissions in manifest
   - Verify async/await usage with storage APIs
   - Monitor storage quota usage

## Security Considerations

### Content Security Policy

The extension follows strict CSP guidelines:
- No inline scripts or styles
- All resources loaded from extension package
- No eval() or similar dynamic code execution

### Permission Management

Request minimal permissions:
- `activeTab`: Only access current tab when user activates extension
- `storage`: Local storage for caching results
- `scripting`: Content script injection for analysis

### Data Privacy

- No user data collection
- All analysis happens locally
- No external server communication (in base version)
- Clear user consent for any future API integrations

## Future Development

### Planned Features

1. **AI Integration**: Real fact-checking API connections
2. **User Customization**: Personal trusted source lists
3. **Social Features**: Community ratings and reviews
4. **Advanced Analytics**: Detailed reporting and insights
5. **Multi-language Support**: International fact-checking

### Architecture Evolution

As the extension grows, consider:
- Module bundling (webpack/rollup) for larger codebases
- TypeScript for better type safety
- Unit testing framework (Jest)
- Automated CI/CD pipeline
- Extension store distribution
