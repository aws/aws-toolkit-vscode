/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from 'aws-core-vscode/shared'

/**
 * Provides context menu items for Amazon Q Auto Debug features.
 * Integrates with VS Code's context menu system to offer debugging assistance.
 */
export class AutoDebugContextMenuProvider implements vscode.Disposable {
    private readonly logger = getLogger()
    private readonly disposables: vscode.Disposable[] = []

    constructor() {
        this.registerMenuItems()
    }

    private registerMenuItems(): void {
        // Context menu items are registered via package.json contributions
        // This class can be used to handle dynamic menu item visibility or other logic
        this.logger.debug('AutoDebugContextMenuProvider: Context menu provider initialized')
    }

    /**
     * Determines if auto debug menu items should be visible
     */
    public shouldShowAutoDebugItems(document?: vscode.TextDocument): boolean {
        if (!document) {
            return false
        }

        // Show for common programming languages
        const supportedLanguages = [
            'typescript',
            'javascript',
            'python',
            'java',
            'csharp',
            'cpp',
            'c',
            'go',
            'rust',
            'php',
            'ruby',
            'swift',
            'kotlin',
        ]

        return supportedLanguages.includes(document.languageId)
    }

    /**
     * Gets the current selection or cursor position for context menu actions
     */
    public getCurrentContext(): { range?: vscode.Range; diagnostics?: vscode.Diagnostic[] } {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return {}
        }

        const selection = editor.selection
        const range = selection.isEmpty ? undefined : selection

        // Get diagnostics for the current range or cursor position
        const allDiagnostics = vscode.languages.getDiagnostics(editor.document.uri)
        let diagnostics: vscode.Diagnostic[] = []

        if (range) {
            // Get diagnostics that intersect with the selection
            diagnostics = allDiagnostics.filter((diagnostic) => diagnostic.range.intersection(range) !== undefined)
        } else {
            // Get diagnostics at the current cursor position
            const cursorPosition = editor.selection.active
            diagnostics = allDiagnostics.filter((diagnostic) => diagnostic.range.contains(cursorPosition))
        }

        return { range, diagnostics }
    }

    public dispose(): void {
        this.logger.debug('AutoDebugContextMenuProvider: Disposing context menu provider')
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
