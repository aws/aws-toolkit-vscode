/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'

import { AwsCdkExplorer } from '../../../cdk/explorer/awsCdkExplorer'
import { CdkAppLocation } from '../../../cdk/explorer/cdkProject'
import * as detectCdkProjects from '../../../cdk/explorer/detectCdkProjects'
import * as app from '../../../cdk/explorer/nodes/appNode'
import { CdkErrorNode } from '../../../cdk/explorer/nodes/errorNode'

let sandbox: sinon.SinonSandbox
beforeEach(function () {
    sandbox = sinon.createSandbox()
})

afterEach(function () {
    sandbox.restore()
})

describe('AwsCdkExplorer', function () {
    it('does nothing if not visible', async function () {
        const awsCdkExplorer = new AwsCdkExplorer()
        awsCdkExplorer.visible = false
        const treeNodes = await awsCdkExplorer.getChildren()
        assert.strictEqual(treeNodes.length, 0)
    })

    it('shows a message if no CDK projects were found', async function () {
        const awsCdkExplorer = new AwsCdkExplorer()
        awsCdkExplorer.visible = true
        const treeNodes = await awsCdkExplorer.getChildren()
        assert.strictEqual(treeNodes.length, 1)
        assert.strictEqual(treeNodes[0] instanceof CdkErrorNode, true)
    })

    it('shows CDK projects', async function () {
        const stubUri = sandbox.createStubInstance(vscode.Uri)
        const workspaceFolder: vscode.WorkspaceFolder = { uri: stubUri, index: 0, name: 'testworkspace' }

        const appLocation: CdkAppLocation = {
            workspaceFolder: workspaceFolder,
            cdkJsonPath: 'cdkJson.fsPath',
            treePath: 'treeJsonPath',
        }
        sandbox.stub(detectCdkProjects, 'detectCdkProjects').resolves([appLocation])

        const stubAppNode = sandbox.createStubInstance(app.AppNode)
        sandbox.stub(app, 'AppNode').returns(stubAppNode)

        const awsCdkExplorer = new AwsCdkExplorer()
        awsCdkExplorer.visible = true
        const treeNodes = await awsCdkExplorer.getChildren()
        assert.strictEqual(treeNodes.length, 1)
        assert.strictEqual(treeNodes[0], stubAppNode)
    })
})
