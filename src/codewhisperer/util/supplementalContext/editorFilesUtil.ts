/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path = require('path')
import { isTestFileByName } from './codeParsingUtil'
import * as vscode from 'vscode'

/**
 * From Editor we refer to the files open in multiple editors (split view)
 * and open files with in one editor.
 */
export async function getRelevantFilesFromEditor(inputFileName: string, language: string): Promise<vscode.Uri[]> {
    // This will provide all open editors (like split view with mulitple windows)
    // with one active file from each editor.
    const filesFromEditors = vscode.window.visibleTextEditors
        .filter(file => {
            return isRelevant(inputFileName, file.document.fileName, language)
        })
        .map(file => file.document.uri)

    // TODO: Need to validate if this will work for all versions of vsCode. (workspace)
    const filesFromOpenList = vscode.workspace.textDocuments
        .filter(doc => {
            return isRelevant(inputFileName, doc.fileName, language)
        })
        .filter(doc => {
            if (filesFromEditors.includes(doc.uri)) {
                return false
            }
            return true
        })
        .map(doc => doc.uri)

    return filesFromEditors.concat(filesFromOpenList)
}

export function isRelevant(inputFileName: string, crossFileName: string, language: string) {
    if (inputFileName === crossFileName) {
        //Same file should not referenced as cross file
        return false
    }
    if (path.extname(crossFileName) !== path.extname(inputFileName)) {
        // Ignore files with different extensions.
        return false
    }

    // We don't need test files for cross file context.
    if (isTestFileByName(crossFileName, language)) {
        return false
    }

    return true
}
