/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { VueWebview } from '../../../webviews/main'
import { createJobPage, Page } from '../utils/constants'

/**
 * Webview class for managing SageMaker notebook job scheduling UI.
 * Extends the base VueWebview class to provide notebook job specific functionality.
 */
export class NotebookJobWebview extends VueWebview {
    /** Path to frontend Vue source file */
    public static readonly sourcePath: string = 'src/sagemakerunifiedstudio/notebookScheduling/vue/index.js'

    /** Unique identifier for this webview */
    public readonly id = 'notebookjob'

    /** Event emitter that fires when the page changes */
    public readonly onShowPage = new vscode.EventEmitter<{ page: Page }>()

    // @ts-ignore
    private webviewPanel?: vscode.WebviewPanel

    /** Tracks the currently displayed page */
    private currentPage: Page = { name: createJobPage, metadata: {} }

    /**
     * Creates a new NotebookJobWebview instance
     */
    public constructor() {
        super(NotebookJobWebview.sourcePath)
    }

    public setWebviewPanel(newWebviewPanel: vscode.WebviewPanel): void {
        this.webviewPanel = newWebviewPanel
    }

    /**
     * Gets the currently displayed page
     * @returns The current page identifier
     */
    public getCurrentPage(): Page {
        return this.currentPage
    }

    /**
     * Sets the current page and emits a page change event
     * @param newPage - The identifier of the new page to display
     */
    public setCurrentPage(newPage: Page): void {
        this.currentPage = newPage
        this.onShowPage.fire({ page: this.currentPage })
    }
}
