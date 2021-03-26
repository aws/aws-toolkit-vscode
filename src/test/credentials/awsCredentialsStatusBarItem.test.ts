/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { updateCredentialsStatusBarItem } from '../../credentials/awsCredentialsStatusBarItem'

describe('updateCredentialsStatusBarItem', async function () {
    let statusBarItem: vscode.StatusBarItem

    beforeEach(async function () {
        statusBarItem = ({
            text: '',
        } as any) as vscode.StatusBarItem
    })

    it('updates text with credentials id', async function () {
        const credentialId = 'qwerty'

        updateCredentialsStatusBarItem(statusBarItem, credentialId)
        assert.ok(
            statusBarItem.text.includes(credentialId),
            'expected statusbar item text to contain the credentials id'
        )
    })

    it('updates text with placeholder when there is no credentials id', async function () {
        updateCredentialsStatusBarItem(statusBarItem, undefined)
        assert.ok(
            statusBarItem.text.includes('(not connected)'),
            'expected statusbar item text to indicate that no credentials are in use'
        )
    })
})
