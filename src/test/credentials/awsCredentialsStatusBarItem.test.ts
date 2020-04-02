/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { updateCredentialsStatusBarItem } from '../../credentials/awsCredentialsStatusBarItem'

describe('updateCredentialsStatusBarItem', async () => {
    let statusBarItem: vscode.StatusBarItem

    beforeEach(async () => {
        statusBarItem = ({
            text: '',
        } as any) as vscode.StatusBarItem
    })

    it('updates text with credentials id', async () => {
        const credentialId = 'qwerty'

        updateCredentialsStatusBarItem(statusBarItem, credentialId)
        assert.ok(
            statusBarItem.text.indexOf(credentialId) >= 0,
            'expected statusbar item text to contain the credentials id'
        )
    })

    it('updates text with placeholder when there is no credentials id', async () => {
        updateCredentialsStatusBarItem(statusBarItem, undefined)
        assert.ok(
            statusBarItem.text.indexOf('(not connected)') >= 0,
            'expected statusbar item text to indicate that no credentials are in use'
        )
    })
})
