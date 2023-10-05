/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebviewPanel } from 'vscode'
import { Session } from '../session/session'

export interface TabContents {
    session: Session
}

export interface Panel {
    webviewPanel: WebviewPanel
    tab: Map<string, TabContents>
}

export class PanelStore {
    private panels: { [panelId: string]: Panel } = {}
    private mostRecentPanelId: string | undefined = undefined

    public getPanel(panelId: string): Panel | undefined {
        return this.panels[panelId]
    }

    public getMostRecentPanel(): Panel | undefined {
        if (this.mostRecentPanelId !== undefined) {
            return this.panels[this.mostRecentPanelId]
        }
        return undefined
    }

    public savePanel(panelId: string, panel: Panel): void {
        this.mostRecentPanelId = panelId
        this.panels[panelId] = panel
    }

    public saveTab(panelId: string, tabId: string, tabContents: TabContents): void {
        const tabs = this.getTab(panelId, tabId)
        if (!tabs) {
            this.panels[panelId].tab = new Map()
        }
        this.panels[panelId].tab.set(tabId, tabContents)
    }

    public deletePanel(panelId: string): void {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this.panels[panelId]
    }

    public deleteTab(panelId: string, tabId: string) {
        const tabs = this.getTab(panelId, tabId)
        if (tabs) {
            this.panels[panelId].tab.delete(tabId)
        }
    }

    public getTab(panelId: string, tabId: string) {
        const panel = this.panels[panelId]
        if (!panel) {
            return
        }
        return panel.tab.get(tabId)
    }
}
