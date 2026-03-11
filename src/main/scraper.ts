import { WebContentsView, type BrowserWindow } from 'electron'

export class Scraper {
  private view: WebContentsView | null = null

  constructor(private mainWindow: BrowserWindow) {}

  async open(url: string, bounds: { x: number; y: number; width: number; height: number }): Promise<WebContentsView> {
    this.view = new WebContentsView()
    this.mainWindow.contentView.addChildView(this.view)
    this.view.setBounds(bounds)
    await new Promise<void>((resolve) => {
      this.view!.webContents.once('did-finish-load', () => resolve())
      this.view!.webContents.loadURL(url)
    })

    return this.view
  }

  async executeJS(script: string): Promise<any> {
    if (!this.view) throw new Error('No scraper view open')
    return this.view.webContents.executeJavaScript(script)
  }

  async waitForNavigation(): Promise<void> {
    if (!this.view) throw new Error('No scraper view open')
    return new Promise((resolve) => {
      this.view!.webContents.once('did-finish-load', () => resolve())
    })
  }

  close(): void {
    if (this.view) {
      this.mainWindow.contentView.removeChildView(this.view)
      this.view.webContents.close()
      this.view = null
    }
  }
}
