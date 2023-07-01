/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { TreeItem } from 'vscode'
import { copyArnCommand } from '../../../awsexplorer/commands/copyArn'
import { AWSResourceNode } from '../../../shared/treeview/nodes/awsResourceNode'
import { TreeShim } from '../../../shared/treeview/utils'
import { FakeEnv } from '../../shared/vscode/fakeEnv'
import { assertNoErrorMessages, getTestWindow } from '../../shared/vscode/window'

describe('copyArnCommand', function () {
    let env: FakeEnv

    beforeEach(function () {
        env = new FakeEnv()
    })

    it('copies arn to clipboard and shows status bar confirmation', async function () {
        const node: AWSResourceNode = {
            arn: 'arn',
            name: 'name',
        }

        await copyArnCommand(node, env)

        assert.strictEqual(env.clipboard.text, 'arn')
        assertNoErrorMessages()
    })

    it('shows error message on failure', async function () {
        await copyArnCommand(new NoArnNode(), env)

        assert.strictEqual(env.clipboard.text, undefined)
        assert.deepStrictEqual(getTestWindow().statusBar.messages, [])
        getTestWindow()
            .getFirstMessage()
            .assertError(/Could not find an ARN/)
    })

    it('handles `TreeShim`', async function () {
        const node = new TreeShim({
            id: 'shim',
            resource: { name: 'resource', arn: 'arn' },
            getTreeItem: () => new TreeItem(''),
        })

        await copyArnCommand(node, env)
        assert.strictEqual(env.clipboard.text, 'arn')
    })
})

class NoArnNode implements AWSResourceNode {
    public name = 'name'

    public get arn(): string {
        throw new Error('Expected failure')
    }
}
