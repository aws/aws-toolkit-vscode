/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { copyArnCommand } from '../../../awsexplorer/commands/copyArn'
import { AWSResourceNode } from '../../../shared/treeview/nodes/awsResourceNode'
import { FakeEnv } from '../../shared/vscode/fakeEnv'
import { FakeWindow } from '../../shared/vscode/fakeWindow'

describe('copyArnCommand', () => {
    let window: FakeWindow
    let env: FakeEnv

    beforeEach(() => {
        window = new FakeWindow()
        env = new FakeEnv()
    })

    it('copies arn to clipboard and shows status bar confirmation', async () => {
        const node: AWSResourceNode = {
            arn: 'arn',
            name: 'name',
        }

        await copyArnCommand(node, window, env)

        assert.strictEqual(env.clipboard.text, 'arn')
        assert.strictEqual(window.message.error, undefined)
    })

    it('shows error message on failure', async () => {
        await copyArnCommand(new NoArnNode(), window, env)

        assert.strictEqual(env.clipboard.text, undefined)
        assert.strictEqual(window.statusBar.message, undefined)
        assert.ok(window.message.error?.includes('Could not find an ARN'))
    })
})

class NoArnNode implements AWSResourceNode {
    public name = 'name'

    public get arn(): string {
        throw new Error('Expected failure')
    }
}
