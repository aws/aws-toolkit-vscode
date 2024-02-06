/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Recommendation } from '../client/codewhisperer'
import { CodeWhispererSettings } from './codewhispererSettings'

export function findLineToInsertImportStatement(editor: vscode.TextEditor, firstLineOfRecommendation: number): number {
    let line = findLineOfLastImportStatement(editor, firstLineOfRecommendation)
    if (line === -1) {
        line = findLineOfFirstCode(editor, firstLineOfRecommendation)
    }
    return line
}

export function findLineOfFirstCode(editor: vscode.TextEditor, firstLineOfRecommendation: number): number {
    const lang = editor.document.languageId
    for (let i = 0; i <= firstLineOfRecommendation; i++) {
        const text = editor.document.lineAt(i).text
        if (lang === 'python') {
            // skip #, empty line
            if (!text.match(/^\s*#/) && !text.match(/^\s*$/)) {
                return i
            }
        } else if (lang === 'javascript' || lang === 'jsx') {
            // skip //, /*, *, */, empty line
            if (
                !text.match(/^\s*\/\//) &&
                !text.match(/\s*use\s+strict/) &&
                !text.match(/^\s*$/) &&
                !text.match(/^\s*\/\s*\*/) &&
                !text.match(/^\s*\*/) &&
                !text.match(/^\s*\*\s*\//)
            ) {
                return i
            }
        } else if (lang === 'java') {
            // skip //, /*, *, */, package, empty line
            if (
                !text.match(/^\s*\/\//) &&
                !text.match(/^\s*package\s+\S+/) &&
                !text.match(/^\s*$/) &&
                !text.match(/^\s*\/\s*\*/) &&
                !text.match(/^\s*\*/) &&
                !text.match(/^\s*\*\s*\//)
            ) {
                return i
            }
        }
    }
    return 0
}

export function findLineOfLastImportStatement(editor: vscode.TextEditor, firstLineOfRecommendation: number): number {
    const lang = editor.document.languageId
    for (let i = firstLineOfRecommendation; i >= 0; i--) {
        const text = editor.document.lineAt(i).text
        if (lang === 'python') {
            if (text.match(/^\s*import\s+\S+/) || text.match(/^\s*from\s+\S+/)) {
                return i + 1
            }
        } else if (lang === 'javascript' || lang === 'jsx') {
            if (text.match(/^\s*import\s+\S+/) || text.match(/=\s*require\s*\(\s*\S+\s*\)\s*;/)) {
                return i + 1
            }
        } else if (lang === 'java') {
            if (text.match(/^\s*import\s+\S+\s*;/)) {
                return i + 1
            }
        }
    }
    return -1
}

/* Returns the number of imports in a recommendation
 *  return undefined if the API response field is missing or import is disabled
 */
export function getImportCount(recommendation: Recommendation): number | undefined {
    if (
        'mostRelevantMissingImports' in recommendation &&
        recommendation.mostRelevantMissingImports !== undefined &&
        CodeWhispererSettings.instance.isImportRecommendationEnabled()
    ) {
        return recommendation.mostRelevantMissingImports.length
    }
    return undefined
}
