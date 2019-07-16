/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { TIMEOUT } from './integrationTestsUtilities'

// tslint:disable no-invalid-this
describe('CodeLense', async () => {
    it('activates the extension', async function () {
        this.timeout(TIMEOUT)
        const extension: vscode.Extension<void> | undefined = vscode.extensions.getExtension(
            'amazonwebservices.aws-toolkit-vscode'
        )
        assert.ok(extension)
        await extension!.activate()
    })
})
