/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { TreeItem } from 'vscode'
import { copyNameCommand } from '../../../awsexplorer/commands/copyName'
import { AWSResourceNode } from '../../../shared/treeview/nodes/awsResourceNode'
import { TreeShim } from '../../../shared/treeview/utils'
import { FakeEnv } from '../../shared/vscode/fakeEnv'

describe('copyNameCommand', function () {
    it('copies name to clipboard and shows status bar confirmation', async function () {
        const node: AWSResourceNode = {
            arn: 'arn',
            name: 'name',
        }

        const env = new FakeEnv()
        await copyNameCommand(node, env)

        assert.strictEqual(env.clipboard.text, 'name')
    })

    it('handles `TreeShim`', async function () {
        const node = new TreeShim({
            id: 'shim',
            resource: { name: 'resource', arn: 'arn' },
            getTreeItem: () => new TreeItem(''),
        })

        const env = new FakeEnv()
        await copyNameCommand(node, env)
        assert.strictEqual(env.clipboard.text, 'resource')
    })
})
