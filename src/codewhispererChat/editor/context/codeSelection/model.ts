/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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

export interface CodeSelectionContext {
    readonly selectedCode: string
    readonly names: CodeNames | undefined
}
