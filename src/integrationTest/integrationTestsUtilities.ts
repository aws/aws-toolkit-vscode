/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'

const SECOND = 1000
export const TIMEOUT = 30 * SECOND

export async function activateExtension(extensionName: string): Promise<vscode.Extension<void>> {
    const extension: vscode.Extension<void> | undefined = vscode.extensions.getExtension(extensionName)
    assert.ok(extension)
    await extension!.activate()

    return extension as vscode.Extension<void>
}

export async function sleep(miliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, miliseconds))
}
