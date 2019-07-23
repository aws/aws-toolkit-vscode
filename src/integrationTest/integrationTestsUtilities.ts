/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'

const SECOND = 1000
export const TIMEOUT = 20 * SECOND

export async function activateExtension(): Promise<vscode.Extension<void>> {
    const extension: vscode.Extension<void> | undefined = vscode.extensions.getExtension(
    'amazonwebservices.aws-toolkit-vscode'
    )
    assert.ok(extension)
    // tslint:disable-next-line: no-unsafe-any
    await extension!.activate()

    return extension as vscode.Extension<void>
}
