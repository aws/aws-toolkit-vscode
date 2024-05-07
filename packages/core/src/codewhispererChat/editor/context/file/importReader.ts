/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Java, Python, TypeScript } from '@aws/fully-qualified-names'
import { extractContextFromJavaImports } from './javaImportReader'

export async function readImports(text: string, languageId: string): Promise<string[]> {
    let names: any = {}
    switch (languageId) {
        case 'java':
            names = await Java.findNames(text)
            break
        case 'javascript':
        case 'javascriptreact':
        case 'typescriptreact':
            // Disable Tsx.findNames because promise Tsx.findNames
            // may not resolve and can cause chat to hang
            //names = await Tsx.findNames(text)
            return []
        case 'python':
            names = await Python.findNames(text)
            break
        case 'typescript':
            //names = await TypeScript.findNames(text)
            return []
    }
    if (names.fullyQualified === undefined) {
        return []
    }
    if (languageId === 'java') {
        return extractContextFromJavaImports(names)
    } else {
        const imports = names.fullyQualified?.declaredSymbols
            .map((symbol: { source: string[] }): string => {
                return symbol.source[0].replace('@', '')
            })
            .filter((source: string) => source.length !== 0)
        return imports
    }
}
