/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Runtime } from 'aws-sdk/clients/lambda'
import { Set as ImmutableSet } from 'immutable'
import { goRuntimes } from '../../lambda/models/samLambdaRuntime'

export const JAVA = 'Java 8+' // eslint-disable-line @typescript-eslint/naming-convention
export const PYTHON = 'Python 3.6+' // eslint-disable-line @typescript-eslint/naming-convention
export const TYPESCRIPT = 'Typescript 3+' // eslint-disable-line @typescript-eslint/naming-convention
export const GO = 'Go 1+' // eslint-disable-line @typescript-eslint/naming-convention
export type SchemaCodeLangs = 'Java 8+' | 'Python 3.6+' | 'Typescript 3+' | 'Go 1+'

export const schemaCodeLangs: ImmutableSet<SchemaCodeLangs> = ImmutableSet([JAVA, PYTHON, TYPESCRIPT, GO])

const javaDetail = {
    apiValue: 'Java8',
    extension: '.java',
}

const pythonDetail = {
    apiValue: 'Python36',
    extension: '.py',
}

const typescriptDetail = {
    apiValue: 'TypeScript3',
    extension: '.ts',
}

const goDetail = {
    apiValue: 'Go1',
    extension: '.go',
}

export function getLanguageDetails(language: SchemaCodeLangs): {
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
        case GO:
            return goDetail
        default:
            throw new Error(`Language ${language} is not supported as Schema Code Language`)
    }
}

export function supportsEventBridgeTemplates(runtime: Runtime): boolean {
    return ['python3.7', 'python3.8', 'python3.9', 'python3.10', 'python3.11', 'python3.12', 'go1.x'].includes(runtime)
}

export function getApiValueForSchemasDownload(runtime: Runtime): string {
    if (supportsEventBridgeTemplates(runtime)) {
        // Python36 really means python3.x for schema downloading
        return goRuntimes.has(runtime) ? 'Go1' : 'Python36'
    }

    throw new Error(`Runtime ${runtime} is not supported by eventBridge application`)
}
