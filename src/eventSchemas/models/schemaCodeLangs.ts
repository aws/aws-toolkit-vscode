/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as immutable from 'immutable'

export const JAVA = 'Java 8+'
export const PYTHON = 'Python 3.6+'
export const TYPESCRIPT = 'Typescript 3+'
export type SchemaCodeLangs = 'Java 8+' | 'Python 3.6+' | 'Typescript 3+'

export const schemaCodeLangs: immutable.Set<SchemaCodeLangs> = immutable.Set([
    JAVA,
    PYTHON,
    TYPESCRIPT
] as SchemaCodeLangs[])

const javaDetail = {
    apiValue: 'Java8',
    extension: '.java'
}

const pythonDetail = {
    apiValue: 'Python36',
    extension: '.py'
}

const typescriptDetail = {
    apiValue: 'TypeScript3',
    extension: '.ts'
}

export function getLanguageDetails(
    language: SchemaCodeLangs
): {
    apiValue: string
    extension: string
} {
    switch (language) {
        case JAVA:
            return javaDetail
        case PYTHON:
            return pythonDetail
        case TYPESCRIPT:
            return typescriptDetail
        default:
            throw new Error(`Language ${language} is not supported as Schema Code Language`)
    }
}
