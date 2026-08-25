const fs = require('fs');
const path = require('path');

// Read files
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
const game1Html = fs.readFileSync(path.join(__dirname, 'games/game-1.html'), 'utf-8');
const game2Html = fs.readFileSync(path.join(__dirname, 'games/game-2.html'), 'utf-8');
const game3Html = fs.readFileSync(path.join(__dirname, 'games/game-3.html'), 'utf-8');
const game4Html = fs.readFileSync(path.join(__dirname, 'games/game-4.html'), 'utf-8');

const games = {
   'games/game-1.html': game1Html,
   'games/game-2.html': game2Html,
   'games/game-3.html': game3Html,
   'games/game-4.html': game4Html
};

// Simulate minimal DOM environment
function createTestEnv(initialHash = '') {
   let currentHash = initialHash;
   const listeners = { hashchange: [] };

   // Simple DOM elements
   function createElement(tag) {
      const attrs = {};
      const children = [];
      const listeners = {};
      return {
         tagName: tag.toUpperCase(),
         className: '',
         innerHTML: '',
         textContent: '',
         dataset: {},
         children,
         attributes: attrs,
         setAttribute(k, v) {
            attrs[k] = String(v);
            if (k.startsWith('data-')) {
               const prop = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
               this.dataset[prop] = String(v);
            }
         },
         getAttribute(k) { return attrs[k] || null; },
         hasAttribute(k) { return k in attrs; },
         removeAttribute(k) { delete attrs[k]; },
         appendChild(child) { children.push(child); return child; },
         addEventListener(evt, fn) {
            listeners[evt] = listeners[evt] || [];
            listeners[evt].push(fn);
         },
         trigger(evt) {
            (listeners[evt] || []).forEach(fn => fn({ target: this }));
         },
         querySelectorAll(sel) {
            const results = [];
            function search(node) {
               if (sel === '.tab-panel' && (node.className === 'tab-panel' || node.attributes && node.attributes['class'] === 'tab-panel')) {
                  results.push(node);
               } else if (sel === '.game-button' && (node.className === 'game-button')) {
                  results.push(node);
               } else if (sel === '.gallery-item' && (node.className === 'gallery-item')) {
                  results.push(node);
               }
               (node.children || []).forEach(search);
            }
            search(this);
            return results;
         },
         querySelector(sel) {
            const res = this.querySelectorAll(sel);
            return res.length > 0 ? res[0] : null;
         }
      };
   }

   const gameListContainer = createElement('div');
   const heroContainer = createElement('div');
   const panelContainer = createElement('div');

   const tabButtons = ['overview', 'rules', 'gallery', 'shops'].map(tabName => {
      const btn = createElement('button');
      btn.className = 'tab';
      btn.dataset.tab = tabName;
      btn.setAttribute('data-tab', tabName);
      btn.setAttribute('aria-selected', tabName === 'overview' ? 'true' : 'false');
      return btn;
   });

   const windowObj = {
      location: {
         get hash() { return currentHash; },
         set hash(val) {
            const old = currentHash;
            currentHash = val;
            if (old !== val) {
               listeners.hashchange.forEach(fn => fn());
            }
         }
      },
      history: {
         replaceState(state, title, url) {
            currentHash = url;
         }
      },
      addEventListener(evt, fn) {
         listeners[evt] = listeners[evt] || [];
         listeners[evt].push(fn);
      }
   };

   // Mock XMLHttpRequest
   class MockXHR {
      open(method, url) { this.url = url; }
      send() {
         setTimeout(() => {
            if (games[this.url]) {
               this.status = 200;
               this.responseText = games[this.url];
               if (this.onload) this.onload();
            } else {
               this.status = 404;
               this.responseText = '';
               if (this.onload) this.onload();
            }
         }, 0);
      }
   }

   // Mock DOMParser
   class MockDOMParser {
      parseFromString(str, type) {
         // extract h2 text
         const h2Match = str.match(/<h2>(.*?)<\/h2>/);
         const heroMatch = str.includes('class="game-hero"');
         const panelMatches = [...str.matchAll(/<div class="tab-panel" data-panel="([^"]+)"/g)];

         const doc = {
            querySelector(sel) {
               if (sel === '.game-hero h2' || sel === 'h2') {
                  return h2Match ? { textContent: h2Match[1] } : null;
               }
               if (sel === '.game-hero') {
                  return heroMatch ? createElement('div') : null;
               }
               return null;
            },
            querySelectorAll(sel) {
               if (sel === '.tab-panel') {
                  return panelMatches.map(m => {
                     const p = createElement('div');
                     p.className = 'tab-panel';
                     p.dataset.panel = m[1];
                     p.setAttribute('data-panel', m[1]);
                     return p;
                  });
               }
               return [];
            }
         };
         return doc;
      }
   }

   return {
      window: windowObj,
      XMLHttpRequest: MockXHR,
      DOMParser: MockDOMParser,
      document: {
         querySelector(sel) {
            if (sel === '#game-list') return gameListContainer;
            if (sel === '#game-hero-container') return heroContainer;
            if (sel === '#game-panel-container') return panelContainer;
            return null;
         },
         querySelectorAll(sel) {
            if (sel === '.tabs .tab') return tabButtons;
            return [];
         },
         createElement
      },
      gameListContainer,
      tabButtons,
      panelContainer,
      heroContainer
   };
}

function runScript(env) {
   // Extract script from index.html
   const scriptMatch = indexHtml.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
   const scriptCode = scriptMatch[1];

   const fn = new Function('window', 'document', 'XMLHttpRequest', 'DOMParser', 'history', 'location', scriptCode);
   fn(env.window, env.document, env.XMLHttpRequest, env.DOMParser, env.window.history, env.window.location);
}

function wait(ms) {
   return new Promise(resolve => setTimeout(resolve, ms));
}

async function testInitialDefaultLoad() {
   const env = createTestEnv('');
   runScript(env);
   await wait(50);

   // Verify hash set to #game-1/overview
   if (env.window.location.hash !== '#game-1/overview') {
      throw new Error(`Expected #game-1/overview, got ${env.window.location.hash}`);
   }

   // Verify tab 0 selected
   const activeTab = env.tabButtons.find(t => t.getAttribute('aria-selected') === 'true');
   if (activeTab.dataset.tab !== 'overview') {
      throw new Error(`Expected overview tab active, got ${activeTab.dataset.tab}`);
   }

   console.log('✓ testInitialDefaultLoad passed');
}

async function testInitialSpecificHash() {
   const env = createTestEnv('#game-3/shops');
   runScript(env);
   await wait(50);

   if (env.window.location.hash !== '#game-3/shops') {
      throw new Error(`Expected #game-3/shops, got ${env.window.location.hash}`);
   }

   const activeTab = env.tabButtons.find(t => t.getAttribute('aria-selected') === 'true');
   if (activeTab.dataset.tab !== 'shops') {
      throw new Error(`Expected shops tab active, got ${activeTab.dataset.tab}`);
   }

   const gameButtons = env.gameListContainer.querySelectorAll('.game-button');
   const activeGameBtn = gameButtons.find(b => b.getAttribute('aria-selected') === 'true');
   if (!activeGameBtn || activeGameBtn.dataset.gameId !== 'game-3') {
      throw new Error(`Expected game-3 button active, got ${activeGameBtn ? activeGameBtn.dataset.gameId : 'none'}`);
   }

   console.log('✓ testInitialSpecificHash passed');
}

async function testTabSwitching() {
   const env = createTestEnv('#game-2/overview');
   runScript(env);
   await wait(50);

   // Click on rules tab (index 1)
   env.tabButtons[1].trigger('click');
   await wait(50);

   if (env.window.location.hash !== '#game-2/rules') {
      throw new Error(`Expected #game-2/rules, got ${env.window.location.hash}`);
   }

   const activeTab = env.tabButtons.find(t => t.getAttribute('aria-selected') === 'true');
   if (activeTab.dataset.tab !== 'rules') {
      throw new Error(`Expected rules tab active, got ${activeTab.dataset.tab}`);
   }

   console.log('✓ testTabSwitching passed');
}

async function testGameSwitching() {
   const env = createTestEnv('#game-1/gallery');
   runScript(env);
   await wait(50);

   // Find game 4 button and click it
   const gameButtons = env.gameListContainer.querySelectorAll('.game-button');
   const game4Btn = gameButtons.find(b => b.dataset.gameId === 'game-4');
   if (!game4Btn) throw new Error('game-4 button not found');

   game4Btn.trigger('click');
   await wait(50);

   if (env.window.location.hash !== '#game-4/gallery') {
      throw new Error(`Expected #game-4/gallery, got ${env.window.location.hash}`);
   }

   const activeGameBtn = gameButtons.find(b => b.getAttribute('aria-selected') === 'true');
   if (activeGameBtn.dataset.gameId !== 'game-4') {
      throw new Error(`Expected game-4 active, got ${activeGameBtn.dataset.gameId}`);
   }

   console.log('✓ testGameSwitching passed');
}

async function testBrowserBackForward() {
   const env = createTestEnv('#game-1/overview');
   runScript(env);
   await wait(50);

   // Switch tab to rules
   env.tabButtons[1].trigger('click');
   await wait(50);
   if (env.window.location.hash !== '#game-1/rules') throw new Error('Failed to switch to rules');

   // Simulate user changing hash (back button)
   env.window.location.hash = '#game-1/overview';
   await wait(50);

   const activeTab = env.tabButtons.find(t => t.getAttribute('aria-selected') === 'true');
   if (activeTab.dataset.tab !== 'overview') {
      throw new Error(`Expected overview tab after back, got ${activeTab.dataset.tab}`);
   }

   console.log('✓ testBrowserBackForward passed');
}

async function main() {
   await testInitialDefaultLoad();
   await testInitialSpecificHash();
   await testTabSwitching();
   await testGameSwitching();
   await testBrowserBackForward();
   console.log('\nAll tests passed successfully!');
}

main().catch(err => {
   console.error('Test failed:', err);
   process.exit(1);
});
