/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { TreeItem } from 'vscode'
import { copyTextCommand } from '../../../awsexplorer/commands/copyText'
import { AWSResourceNode } from '../../../shared/treeview/nodes/awsResourceNode'
import { TreeShim } from '../../../shared/treeview/utils'
import { FakeEnv } from '../../shared/vscode/fakeEnv'

describe('copyTextCommand', function () {
    it('copies name to clipboard and shows status bar confirmation', async function () {
        const node: AWSResourceNode = {
            arn: 'arn',
            name: 'name',
        }

        const env = new FakeEnv()
        await copyTextCommand(node, 'name', env)

        assert.strictEqual(env.clipboard.text, 'name')
    })

    it('handles `TreeShim`', async function () {
        const node = new TreeShim({
            id: 'shim',
            resource: { name: 'resource', arn: 'arn' },
            getTreeItem: () => new TreeItem(''),
        })

        const env = new FakeEnv()
        await copyTextCommand(node, 'name', env)
        assert.strictEqual(env.clipboard.text, 'resource')
    })

    it('copies arn to clipboard and shows status bar confirmation', async function () {
        const node: AWSResourceNode = {
            arn: 'arn',
            name: 'name',
        }

        const env = new FakeEnv()
        await copyTextCommand(node, 'ARN', env)

        assert.strictEqual(env.clipboard.text, 'arn')
    })

    it('copies id to clipboard and shows status bar confirmation', async function () {
        const node: AWSResourceNode = {
            arn: 'arn',
            name: 'name',
            id: 'id',
        }

        const env = new FakeEnv()
        await copyTextCommand(node, 'id', env)

        assert.strictEqual(env.clipboard.text, 'id')
    })
})
