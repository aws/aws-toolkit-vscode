// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Java, Python, TypeScript, Tsx } from '@aws/fully-qualified-names'

export async function findNames(inputCode, languageId) {
    const fqn = await import('@aws/fully-qualified-names')
    switch (languageId) {
        case 'java':
            return await fqn.Java.findNames(inputCode);
        case 'javascript':
        case 'javascriptreact':
        case 'typescriptreact':
            return await fqn.Tsx.findNames(inputCode);
        case 'python':
            return await fqn.Python.findNames(inputCode);
        case 'typescript':
            return await fqn.TypeScript.findNames(inputCode);
        default:
            return {}
    }
}

export class Selection {
    startLine;
    startColumn;
    endLine;
    endColumn;

}


export async function findNamesWithInExtent(fileText, languageId, startLine,startColumn, endLine, endColumn ){
    const fqn = await import('@aws/fully-qualified-names')

    const startLocation = new fqn.Location(startLine, startColumn)
    const endLocation = new fqn.Location(endLine, endColumn)
    const extent = new fqn.Extent(startLocation, endLocation)

    switch (languageId) {
        case 'java':
            return await fqn.Java.findNamesWithInExtent(fileText, extent)
        case 'javascript':
        case 'javascriptreact':
        case 'typescriptreact':
            return await fqn.Tsx.findNamesWithInExtent(fileText, extent)
        case 'python':
            return await fqn.Python.findNamesWithInExtent(fileText, extent)
        case 'typescript':
            return await fqn.TypeScript.findNamesWithInExtent(fileText, extent)
        default:
            return {}
    }
}
