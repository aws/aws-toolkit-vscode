/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as _path from 'path'
import { Settings } from '../settings'
import { MRUList } from './collectionUtils'

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

/**
 * Unlike the support of accessing open files(tabs) in the workspace which are sorted by visual order (from left to right).
 * VSCode doesn't expose its API to access most recently used/viewed files (functionality of pressing ctrl + tab https://github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/parts/editor/editorQuickAccess.ts#L193)
 * Thus having this cache object as the workaround before VSCode exposes the API.
 *
 * The subscription of users action events (onDidClose, onDidChangeTextEditorSelection) is done in [extension.ts]
 */
class MRUDocumentCache extends MRUList<vscode.TextDocument> {
    readonly onDidChangeTextEditorSelection: vscode.Disposable = vscode.window.onDidChangeTextEditorSelection(
        async e => {
            const editor = e.textEditor
            // Note: Do not store editors in the MRU cache because editors will have different object reference even if the document is the same
            if (editor) {
                this.add(editor.document)
            }
        }
    )

    readonly onDidCloseTextDocument: vscode.Disposable = vscode.workspace.onDidCloseTextDocument(e => {
        this.remove(e)
    })

    static readonly mruDocumentCacheSize = 20
}

export const MRUDocuments = new MRUDocumentCache(MRUDocumentCache.mruDocumentCacheSize)
