import { BrowserWindow } from 'electron'

export class Scraper {
  private window: BrowserWindow | null = null

  async open(url: string): Promise<BrowserWindow> {
    this.window = new BrowserWindow({
      width: 1000,
      height: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    await new Promise<void>((resolve) => {
      this.window!.webContents.once('did-finish-load', () => resolve())
      this.window!.loadURL(url)
    })

    return this.window
  }

  async executeJS(script: string): Promise<any> {
    if (!this.window) throw new Error('No scraper window open')
    return this.window.webContents.executeJavaScript(script)
  }

  async waitForNavigation(): Promise<void> {
    if (!this.window) throw new Error('No scraper window open')
    return new Promise((resolve) => {
      this.window!.webContents.once('did-finish-load', () => resolve())
    })
  }

  /** Execute a JS click script and wait for the resulting navigation to complete.
   *  Registers the did-finish-load listener BEFORE executing the script to avoid race conditions. */
  async clickAndWaitForNavigation(clickScript: string): Promise<void> {
    if (!this.window) throw new Error('No scraper window open')
    const navPromise = new Promise<void>((resolve) => {
      this.window!.webContents.once('did-finish-load', () => resolve())
    })
    await this.window.webContents.executeJavaScript(clickScript)
    await navPromise
  }

  /** Poll until a CSS selector is found in the page, or throw after timeout. */
  async waitForSelector(selector: string, timeoutMs = 15000): Promise<void> {
    if (!this.window) throw new Error('No scraper window open')
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const found = await this.executeJS(
        `!!document.querySelector(${JSON.stringify(selector)})`
      )
      if (found) return
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error(`Timed out waiting for selector: ${selector}`)
  }

  /** Show a password prompt overlay inside the scraper window and return the entered value. */
  async promptPassword(label: string): Promise<string> {
    if (!this.window) throw new Error('No scraper window open')
    return this.executeJS(`
      new Promise(function(resolve) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;';
        var box = document.createElement('div');
        box.style.cssText = 'background:#1a1a2e;color:#fff;padding:32px;border-radius:12px;min-width:350px;font-family:system-ui,sans-serif;';
        box.innerHTML = '<div style="font-size:16px;margin-bottom:16px;">' + ${JSON.stringify(label)} + '</div>'
          + '<input type="password" id="__scraper_pw" style="width:100%;box-sizing:border-box;padding:10px;font-size:16px;border-radius:6px;border:1px solid #444;background:#2a2a3e;color:#fff;margin-bottom:16px;" />'
          + '<button id="__scraper_pw_ok" style="width:100%;padding:10px;font-size:16px;border-radius:6px;border:none;background:#4361ee;color:#fff;cursor:pointer;">OK</button>';
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        var input = document.getElementById('__scraper_pw');
        input.focus();
        function submit() {
          var val = input.value;
          overlay.remove();
          resolve(val);
        }
        document.getElementById('__scraper_pw_ok').addEventListener('click', submit);
        input.addEventListener('keydown', function(e) { if (e.key === 'Enter') submit(); });
      })
    `)
  }

  close(): void {
    if (this.window) {
      this.window.close()
      this.window = null
    }
  }
}
