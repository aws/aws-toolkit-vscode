/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Java, Python, TypeScript, Tsx, Extent, Location } from '@aws/fully-qualified-names'
import * as vs from 'vscode'

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
        case 'java':
            names = await Java.findNamesWithInExtent(fileText, extent)
            break
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
