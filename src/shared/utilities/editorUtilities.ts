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
