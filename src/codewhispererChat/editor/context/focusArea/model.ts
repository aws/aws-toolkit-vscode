/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Selection } from 'vscode'

export interface CodeNames {
    simpleNames: string[]
    fullyQualifiedNames: {
        used: FullyQualifiedName[]
    }
}

export interface FullyQualifiedName {
    readonly source: string[]
    readonly symbol: string[]
}

export interface FocusAreaContext {
    readonly codeBlock: string
    readonly extendedCodeBlock: string
    readonly selectionInsideExtendedCodeBlock: Selection | undefined
    readonly names: CodeNames | undefined
}
