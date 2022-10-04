/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Python, TypeScript, Tsx, Extent, Location } from '../fqn'
import * as vs from 'vscode'

const supportedLanguages = new Set<string>(['javascript', 'javascriptreact', 'typescriptreact', 'python', 'typescript'])

export function isDocumentLanguageSupported(document?: vs.TextDocument): boolean {
    if (document === undefined) {
        return false
    }

    return supportedLanguages.has(document.languageId)
}

export async function getSimpleAndFqnNames(document?: vs.TextDocument): Promise<any> {
    if (document === undefined) {
        return undefined
    }

    const fileText = document.getText()

    const firstLine = document.lineAt(0).range
    const lastLine = document.lineAt(document.lineCount - 1).range

    const extent: Extent = new Extent(
        new Location(firstLine.start.line, firstLine.start.character),
        new Location(lastLine.end.line, lastLine.end.character)
    )

    let names: any = {}
    switch (document.languageId) {
        case 'javascript':
        case 'javascriptreact':
        case 'typescriptreact':
            names = await Tsx.findNamesWithInExtent(fileText, extent)
            break
        case 'python':
            names = await Python.findNamesWithInExtent(fileText, extent)
            break
        case 'typescript':
            names = await TypeScript.findNamesWithInExtent(fileText, extent)
            break
    }

    return names
}
