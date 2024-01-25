/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { copyTextCommand } from '../../../awsexplorer/commands/copyText'
import { AWSResourceNode } from '../../../shared/treeview/nodes/awsResourceNode'
import { TreeShim } from '../../../shared/treeview/utils'
import { FakeClipboard } from '../../shared/vscode/fakeEnv'

describe('copyTextCommand', function () {
    beforeEach(function () {
        const fakeClipboard = new FakeClipboard()
        sinon.stub(vscode.env, 'clipboard').value(fakeClipboard)
    })

    it('copies name to clipboard and shows status bar confirmation', async function () {
        const node: AWSResourceNode = {
            arn: 'arn',
            name: 'name',
        }

        await copyTextCommand(node, 'name')

        assert.strictEqual(await vscode.env.clipboard.readText(), 'name')
    })

    it('handles `TreeShim`', async function () {
        const node = new TreeShim({
            id: 'shim',
            resource: { name: 'resource', arn: 'arn' },
            getTreeItem: () => new vscode.TreeItem(''),
        })

        await copyTextCommand(node, 'name')
        assert.strictEqual(await vscode.env.clipboard.readText(), 'resource')
    })

    it('copies arn to clipboard and shows status bar confirmation', async function () {
        const node: AWSResourceNode = {
            arn: 'arn',
            name: 'name',
        }

        await copyTextCommand(node, 'ARN')

        assert.strictEqual(await vscode.env.clipboard.readText(), 'arn')
    })

    it('copies id to clipboard and shows status bar confirmation', async function () {
        const node: AWSResourceNode = {
            arn: 'arn',
            name: 'name',
            id: 'id',
        }

        await copyTextCommand(node, 'id')

        assert.strictEqual(await vscode.env.clipboard.readText(), 'id')
    })
})
