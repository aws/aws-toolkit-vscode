/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { extractContextFromJavaImports } from './javaImportReader'

export async function readImports(text: string, languageId: string): Promise<string[]> {
    const names: any = {}
    //  TODO: call findNames from @aws/fully-qualified-names for imports
    //  after promise not resolving issue is fixed

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
