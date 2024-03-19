/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as _path from 'path'
import { Settings } from '../settings'

const defaultTabSize = 4

export function getTabSizeSetting(): number {
    return Settings.instance.getSection('editor').get('tabSize', defaultTabSize)
}

export function getInlineSuggestEnabled(): boolean {
    return Settings.instance.getSection('editor').get('inlineSuggest.enabled', true)
}

/**
 * Unlike vscode.window.visibleTextEditors, which will only return the "visible" files in the IDE, this function will return all files opened in the IDE.
 * Note: vscode.workspace.textDocuments has similar behavior as vscode.window.visibleTextEditors does, thus not apply to this use case
 * See also: https://github.com/microsoft/vscode/issues/8886#issuecomment-259158438
 * @param filterPredicate a predicate with file path as the argument used to filter all opened files
 * @returns if no filterPredicate is provided, it will return all files in the IDE tabs otherwise the result matching the predicate
 */
export async function getOpenFilesInWindow(
    filterPredicate?: (filePath: string) => Promise<boolean>
): Promise<string[]> {
    const filesOpenedInEditor: string[] = []

    try {
        const tabArrays = vscode.window.tabGroups.all
        tabArrays.forEach(tabArray => {
            tabArray.tabs.forEach(tab => {
                filesOpenedInEditor.push((tab.input as any).uri.fsPath)
            })
        })
    } catch (e) {
        // Older versions of VSC do not have the tab API
    }

    if (filterPredicate) {
        // since we are not able to use async predicate in array.filter
        // return filesOpenedInEditor.filter(async filePath => await filterPredicate(filePath))
        const resultsWithNulls = await Promise.all(
            filesOpenedInEditor.map(async file => {
                const aResult = await filterPredicate(file)
                return aResult ? file : undefined
            })
        )

        return resultsWithNulls.filter(item => item !== undefined) as string[]
    } else {
        return filesOpenedInEditor
    }
}

export function isTextEditor(editor: vscode.TextEditor): boolean {
    const scheme = editor.document.uri.scheme
    return scheme !== 'debug' && scheme !== 'output' && scheme !== 'vscode-terminal'
}
