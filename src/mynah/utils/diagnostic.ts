/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'crypto'
import { Diagnostic } from 'vscode'

export function getErrorId(diagnostic: Diagnostic, filePath: string): string {
    const hashKeyObject = {
        message: diagnostic.message,
        filePath,
        errorCode: getDiagnosticErrorCode(diagnostic),
    }
    return createHash('sha256')
        .update(JSON.stringify(hashKeyObject, Object.keys(hashKeyObject).sort()))
        .digest('hex')
}

export function getDiagnosticErrorCode(diagnostic: Diagnostic): string {
    if (diagnostic.code === undefined) {
        return ''
    }

    return typeof diagnostic.code === 'object' ? String(diagnostic.code.value) : String(diagnostic.code)
}
