/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import * as app from '../../../cdk/explorer/cdkProject'
import * as appNode from '../../../cdk/explorer/nodes/appNode'
import { ConstructNode } from '../../../cdk/explorer/nodes/constructNode'
import { cdk } from '../../../cdk/globals'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { clearTestIconPaths, IconPath, setupTestIconPaths } from '../iconPathUtils'
import * as treeUtils from '../treeTestUtils'

let sandbox: sinon.SinonSandbox
describe('AppNode', function () {
    before(async function () {
        setupTestIconPaths()
    })

    after(async function () {
        clearTestIconPaths()
    })

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    const workspaceFolderPath = 'rootcdk-project'
    const workspaceFolderName = 'cdk-test-folder'
    const cdkJsonPath = path.join(workspaceFolderPath, workspaceFolderName, 'cdk.json')
    const treePath = path.join(cdkJsonPath, '..', 'cdk.out', 'tree.json')

    it('initializes label and tooltip', async function () {
        const testNode = getTestNode()

        assert.strictEqual(testNode.label, path.relative(path.dirname(workspaceFolderPath), path.dirname(cdkJsonPath)))
        assert.strictEqual(testNode.tooltip, `${cdkJsonPath}`)
    })

    it('initializes icon paths', async function () {
        const testNode = getTestNode()

        const iconPath = testNode.iconPath as IconPath

        assert.strictEqual(iconPath.dark.path, cdk.iconPaths.dark.cdk, 'Unexpected dark icon path')
        assert.strictEqual(iconPath.light.path, cdk.iconPaths.light.cdk, 'Unexpected light icon path')
    })

    it('returns placeholder node when app contains no stacks', async function () {
        const testNode = getTestNode()
        const mockApp: app.CdkApp = { metadata: treeUtils.getTreeWithNoStack(), location: testNode.app }
        sandbox.stub(app, 'getApp').resolves(mockApp)

        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof PlaceholderNode, true)
    })

    it('returns construct node when app has stacks', async function () {
        const testNode = getTestNode()
        const mockApp: app.CdkApp = { metadata: treeUtils.getTree(), location: testNode.app }
        sandbox.stub(app, 'getApp').resolves(mockApp)

        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof ConstructNode, true)
    })

    it('returns placeholder node when tree.json cannot be loaded', async function () {
        const testNode = getTestNode()
        sandbox.stub(app, 'getApp').throws()

        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof PlaceholderNode, true)
    })

    function getTestNode(): appNode.AppNode {
        const mockUri = sandbox.createStubInstance(vscode.Uri)
        sandbox.stub(mockUri, 'fsPath').value(workspaceFolderPath)
        const mockWorkspaceFolder: vscode.WorkspaceFolder = { uri: mockUri, index: 0, name: workspaceFolderName }
        const appLocation: app.CdkAppLocation = {
            cdkJsonPath: cdkJsonPath,
            treePath: treePath,
            workspaceFolder: mockWorkspaceFolder,
        }

        return new appNode.AppNode(appLocation)
    }
})
