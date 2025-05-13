/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { PredictionTracker } from './predictionTracker'

/**
 * Monitors document changes in the editor and track them for prediction.
 */
export class PredictionKeyStrokeHandler {
    private disposables: vscode.Disposable[] = []
    private tracker: PredictionTracker
    private shadowCopies: Map<string, string> = new Map()

    /**
     * Creates a new PredictionKeyStrokeHandler
     * @param context The extension context
     * @param tracker The prediction tracker instance
     * @param config Configuration options
     */
    constructor(tracker: PredictionTracker) {
        this.tracker = tracker

        // Initialize shadow copies for currently visible editors when extension starts
        this.initializeVisibleDocuments()

        // Register event handlers
        this.registerVisibleDocumentListener()
        this.registerTextDocumentChangeListener()
    }

    /**
     * Initializes shadow copies for all currently visible text editors
     */
    private initializeVisibleDocuments(): void {
        const editors = vscode.window.visibleTextEditors

        for (const editor of editors) {
            if (editor.document.uri.scheme === 'file') {
                this.updateShadowCopy(editor.document)
            }
        }
    }

    /**
     * Registers listeners for visibility events to maintain shadow copies of document content
     * Only store and update shadow copies for currently visible editors
     * And remove shadow copies for files that are no longer visible
     * And edits are processed only if a shadow copy exists
     * This avoids the memory problem if hidden files are bulk edited, i.e. with global find/replace
     */
    private registerVisibleDocumentListener(): void {
        // Track when documents become visible (switched to)
        const visibleDisposable = vscode.window.onDidChangeVisibleTextEditors((editors) => {
            const currentVisibleFiles = new Set<string>()

            for (const editor of editors) {
                if (editor.document.uri.scheme === 'file') {
                    const filePath = editor.document.uri.fsPath
                    currentVisibleFiles.add(filePath)
                    this.updateShadowCopy(editor.document)
                }
            }

            for (const filePath of this.shadowCopies.keys()) {
                if (!currentVisibleFiles.has(filePath)) {
                    this.shadowCopies.delete(filePath)
                }
            }
        })

        this.disposables.push(visibleDisposable)
    }

    private updateShadowCopy(document: vscode.TextDocument): void {
        if (document.uri.scheme === 'file') {
            this.shadowCopies.set(document.uri.fsPath, document.getText())
        }
    }

    /**
     * Registers listener for text document changes to send to tracker
     */
    private registerTextDocumentChangeListener(): void {
        // Listen for document changes
        const changeDisposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
            const filePath = event.document.uri.fsPath
            const prevContent = this.shadowCopies.get(filePath)

            // Skip if there are no content changes or if the file is not visible
            if (
                event.contentChanges.length === 0 ||
                event.document.uri.scheme !== 'file' ||
                prevContent === undefined
            ) {
                return
            }

            await this.tracker.processEdit(event.document, prevContent)
            this.updateShadowCopy(event.document)
        })

        this.disposables.push(changeDisposable)
    }

    /**
     * Disposes of all resources used by this handler
     */
    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
