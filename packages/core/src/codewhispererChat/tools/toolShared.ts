/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import fs from '../../shared/fs/fs'

export const maxToolResponseSize = 30720 // 30KB
export const maxToolOutputCharacterLength = 800_000

export enum OutputKind {
    Text = 'text',
    Json = 'json',
}

export interface InvokeOutput {
    output: {
        kind: OutputKind
        content: string | any
    }
}

export interface CommandValidation {
    requiresAcceptance: boolean
    warning?: string
}

export function sanitizePath(inputPath: string): string {
    let sanitized = inputPath.trim()

    if (sanitized.startsWith('~')) {
        sanitized = path.join(fs.getUserHomeDir(), sanitized.slice(1))
    }

    if (!path.isAbsolute(sanitized)) {
        sanitized = path.resolve(sanitized)
    }
    return sanitized
}
