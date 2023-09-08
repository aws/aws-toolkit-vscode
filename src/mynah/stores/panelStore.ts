/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebviewPanel } from 'vscode'

export interface Panel {
    webviewPanel: WebviewPanel
    searchId: string
}

export class PanelStore {
    private panels: { [panelId: string]: Panel } = {}
    private mostRecentPanelId: string | undefined = undefined
    private liveSearchPanelId: string | undefined = undefined

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

    public deletePanel(panelId: string): void {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this.panels[panelId]
        if (panelId === this.liveSearchPanelId) {
            this.clearLiveSearchPane()
        }
    }

    public isMynahPaneOpen(): boolean {
        return Object.keys(this.panels).length > 0
    }

    public getLiveSearchPanelId(): string | undefined {
        return this.liveSearchPanelId
    }

    public setLiveSearchPanelId(panelId: string): string {
        return (this.liveSearchPanelId = panelId)
    }

    public clearLiveSearchPane(): void {
        this.liveSearchPanelId = undefined
    }
}
