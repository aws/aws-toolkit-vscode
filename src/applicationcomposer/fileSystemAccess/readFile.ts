/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import type { WebviewContext } from '../types'

export async function readFile(filePath: string, context: WebviewContext) {
    try {
        const fileContents = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))
        return fileContents.toString()
    } catch (exception) {
        return
    }
}
