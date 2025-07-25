/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { VueWebview } from '../../../webviews/main'
import { createJobPage } from '../utils/constants'

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
    public readonly onShowPage = new vscode.EventEmitter<{ page: string }>()

    /** Tracks the currently displayed page */
    private currentPage: string = createJobPage

    private newJob?: string
    private newJobDefinition?: string

    /**
     * Creates a new NotebookJobWebview instance
     */
    public constructor() {
        super(NotebookJobWebview.sourcePath)
    }

    /**
     * Gets the currently displayed page
     * @returns The current page identifier
     */
    public getCurrentPage(): string {
        return this.currentPage
    }

    /**
     * Sets the current page and emits a page change event
     * @param newPage - The identifier of the new page to display
     */
    public setCurrentPage(newPage: string): void {
        this.currentPage = newPage
        this.onShowPage.fire({ page: this.currentPage })
    }

    public getNewJob(): string | undefined {
        return this.newJob
    }

    public setNewJob(newJob?: string): void {
        this.newJob = newJob
    }

    public getNewJobDefinition(): string | undefined {
        return this.newJobDefinition
    }

    public setNewJobDefinition(jobDefinition?: string): void {
        this.newJobDefinition = jobDefinition
    }
}
