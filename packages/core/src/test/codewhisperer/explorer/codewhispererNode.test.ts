/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import assert from 'assert'
import sinon from 'sinon'
import { CodeWhispererNode, getCodewhispererNode } from '../../../codewhisperer/explorer/codewhispererNode'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'

describe('codewhispererNode', function () {
    let isConnectionValid: sinon.SinonStub
    let isConnected: sinon.SinonStub
    let codewhispererNode: CodeWhispererNode

    before(function () {
        codewhispererNode = getCodewhispererNode()
    })

    beforeEach(function () {
        isConnectionValid = sinon.stub(AuthUtil.instance, 'isConnectionValid')
        isConnectionValid.returns(false)

        isConnected = sinon.stub(AuthUtil.instance, 'isConnected')
        isConnected.returns(false)

        sinon.stub(AuthUtil.instance, 'isUsingSavedConnection').get(() => false)
    })

    describe('getTreeItem', function () {
        afterEach(function () {
            sinon.restore()
        })

        it('should create a node with correct label and description', function () {
            const node = codewhispererNode
            const treeItem = node.getTreeItem()

            assert.strictEqual(treeItem.label, 'CodeWhisperer')
            assert.strictEqual(treeItem.contextValue, 'awsCodeWhispererNode')
            assert.strictEqual(treeItem.description, '')
        })

        it('should create a node showing AWS Builder ID connection', function () {
            sinon.stub(AuthUtil.instance, 'isUsingSavedConnection').get(() => true)
            sinon.stub(AuthUtil.instance, 'isBuilderIdInUse').resolves(true)
            isConnectionValid.returns(true)

            const node = codewhispererNode
            const treeItem = node.getTreeItem()

            assert.strictEqual(treeItem.label, 'CodeWhisperer')
            assert.strictEqual(treeItem.contextValue, 'awsCodeWhispererNodeSaved')
            assert.strictEqual(treeItem.description, 'AWS Builder ID Connected')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
        })

        it('should create a node showing IAM connection', function () {
            sinon.stub(AuthUtil.instance, 'isUsingSavedConnection').get(() => true)
            //sinon.stub(AuthUtil.instance, 'isBuilderIdInUse').resolves(false)
            isConnectionValid.returns(true)

            const node = codewhispererNode
            const treeItem = node.getTreeItem()

            assert.strictEqual(treeItem.label, 'CodeWhisperer')
            assert.strictEqual(treeItem.contextValue, 'awsCodeWhispererNodeSaved')
            assert.strictEqual(treeItem.description, 'IAM Connected')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
        })

        it('should create a node showing enterprise SSO connection', function () {
            sinon.stub(AuthUtil.instance, 'isUsingSavedConnection').get(() => true)
            sinon.stub(AuthUtil.instance, 'isEnterpriseSsoInUse').resolves(true)
            isConnectionValid.returns(true)

            const node = codewhispererNode
            const treeItem = node.getTreeItem()

            assert.strictEqual(treeItem.label, 'CodeWhisperer')
            assert.strictEqual(treeItem.contextValue, 'awsCodeWhispererNodeSaved')
            assert.strictEqual(treeItem.description, 'IAM Identity Center Connected')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
        })
    })

    describe('getChildren', function () {
        afterEach(function () {
            sinon.restore()
        })

        it('should get correct child nodes if user is not connected', function () {
            const node = codewhispererNode
            const children = node.getChildren()
            const ssoSignInNode = children.find(c => c.resource.id === 'aws.codewhisperer.manageConnections')
            const learnMorenNode = children.find(c => c.resource.id === 'aws.codeWhisperer.learnMore')

            assert.strictEqual(children.length, 2)
            assert.ok(ssoSignInNode)
            assert.ok(learnMorenNode)
        })

        it('should get correct child nodes if user is  connected', function () {
            sinon.stub(AuthUtil.instance, 'isUsingSavedConnection').get(() => true)
            isConnectionValid.returns(true)
            isConnected.returns(true)
            const node = codewhispererNode
            const ids = node.getChildren().map(o => o.resource.id)
            assert.deepStrictEqual(ids, [
                'aws.codeWhisperer.toggleCodeSuggestion',
                'aws.codeWhisperer.toggleCodeScan',
                'aws.codeWhisperer.security.scan',
                'aws.codeWhisperer.openReferencePanel',
                'aws.codeWhisperer.gettingStarted',
            ])
        })
    })
})
