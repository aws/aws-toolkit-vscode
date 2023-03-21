/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as sinon from 'sinon'
import { codewhispererNode } from '../../../codewhisperer/explorer/codewhispererNode'
import { AuthUtil } from '../../../codewhisperer/util/authUtil' 

describe('codewhispererNode', function () {
    describe('getTreeItem', function () {
        afterEach(function () {
            sinon.restore()
        })

        it('should create a node with correct label and description', function () {
            const node = codewhispererNode
            const treeItem = node.getTreeItem()

            assert.strictEqual(treeItem.label, 'CodeWhisperer (Preview)')
            assert.strictEqual(treeItem.contextValue, 'awsCodeWhispererNode')
            assert.strictEqual(treeItem.description, '')
        })

        it('should create a node showing AWS Builder ID connection', function () {
            sinon.stub(AuthUtil.instance, 'isUsingSavedConnection').get(() => true)            
            sinon.stub(AuthUtil.instance, 'isConnectionValid').resolves(true)
            const node = codewhispererNode
            const treeItem = node.getTreeItem()
            
            assert.strictEqual(treeItem.label, 'CodeWhisperer (Preview)')
            assert.strictEqual(treeItem.contextValue, 'awsCodeWhispererNodeSaved')
            assert.strictEqual(treeItem.description, 'AWS Builder ID Connected')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
        })

        it('should create a node showing enterprise SSO connection', function () {
            sinon.stub(AuthUtil.instance, 'isUsingSavedConnection').get(() => true)            
            sinon.stub(AuthUtil.instance, 'isConnectionValid').resolves(true)
            sinon.stub(AuthUtil.instance, 'isEnterpriseSsoInUse').resolves(true)
            const node = codewhispererNode
            const treeItem = node.getTreeItem()
           
            assert.strictEqual(treeItem.label, 'CodeWhisperer (Preview)')
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
            const ssoSignInNode = children.find(c => c.resource.id == 'aws.codeWhisperer.sso')
            const learnMorenNode = children.find(c => c.resource.id == 'aws.codeWhisperer.learnMore')    

            assert.strictEqual(children.length, 2)
            assert.ok(ssoSignInNode)
            assert.ok(learnMorenNode)
        })   
    })
})