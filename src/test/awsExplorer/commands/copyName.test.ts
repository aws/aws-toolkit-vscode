/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { copyNameCommand } from '../../../awsexplorer/commands/copyName'
import { AWSResourceNode } from '../../../shared/treeview/nodes/awsResourceNode'
import { FakeEnv } from '../../shared/vscode/fakeEnv'
import { FakeWindow } from '../../shared/vscode/fakeWindow'

describe('copyNameCommand', () => {
    it('copies name to clipboard and shows status bar confirmation', async () => {
        const node: AWSResourceNode = {
            arn: 'arn',
            name: 'name',
        }

        const window = new FakeWindow()
        const env = new FakeEnv()
        await copyNameCommand(node, window, env)

        assert.strictEqual(env.clipboard.text, 'name')
        assert.strictEqual(window.statusBar.message, '$(clippy) Copied name to clipboard')
    })
})
