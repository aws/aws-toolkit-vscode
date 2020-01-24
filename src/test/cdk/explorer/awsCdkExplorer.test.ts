/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'

import { AwsCdkExplorer } from '../../../cdk/explorer/awsCdkExplorer'
import { CdkAppLocation } from '../../../cdk/explorer/cdkProject'
import * as detectCdkProjects from '../../../cdk/explorer/detectCdkProjects'
import * as app from '../../../cdk/explorer/nodes/appNode'
import { CdkErrorNode } from '../../../cdk/explorer/nodes/errorNode'

let sandbox: sinon.SinonSandbox
beforeEach(() => {
    sandbox = sinon.createSandbox()
})

afterEach(() => {
    sandbox.restore()
})
describe('AwsCdkExplorer', () => {
    it('Displays Error node indicating that no CDK projects were found in empty workspace', async () => {
        const awsCdkExplorer = new AwsCdkExplorer()

        const treeNodesPromise = awsCdkExplorer.getChildren()

        const treeNodes = await treeNodesPromise
        assert(treeNodes)
        assert.strictEqual(treeNodes.length, 1)
        assert.strictEqual(treeNodes[0] instanceof CdkErrorNode, true)
    })

    it('Displays a project node when workspaces are detected', async () => {
        const stubUri = sandbox.createStubInstance(vscode.Uri)
        const workspaceFolder: vscode.WorkspaceFolder = { uri: stubUri, index: 0, name: 'testworkspace' }

        const appLocation: CdkAppLocation = {
            workspaceFolder: workspaceFolder,
            cdkJsonPath: 'cdkJson.fsPath',
            treePath: 'treeJsonPath'
        }
        sandbox.stub(detectCdkProjects, 'detectCdkProjects').resolves([appLocation])

        const stubAppNode = sandbox.createStubInstance(app.AppNode)
        sandbox.stub(app, 'AppNode').returns(stubAppNode)

        const awsCdkExplorer = new AwsCdkExplorer()
        const treeNodesPromise = awsCdkExplorer.getChildren()
        const treeNodes = await treeNodesPromise
        assert(treeNodes)
        assert.strictEqual(treeNodes.length, 1)
        assert.strictEqual(treeNodes[0], stubAppNode)
    })
})
