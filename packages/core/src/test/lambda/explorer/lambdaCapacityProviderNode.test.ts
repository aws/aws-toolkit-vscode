/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { LambdaCapacityProviderNode } from '../../../lambda/explorer/lambdaCapacityProviderNode'
import { TestAWSTreeNode } from '../../shared/treeview/nodes/testAWSTreeNode'
import path from 'path'
import { fs } from '../../../shared/fs/fs'
import { contextValueLambdaCapacityProvider } from '../../../lambda/explorer/lambdaCapacityProviderNode'
import sinon from 'sinon'
import * as editLambdaModule from '../../../lambda/commands/editLambda'

describe('LambdaCapacityProviderNode', function () {
    const parentNode = new TestAWSTreeNode('test node')
    const fakeRegion = 'fakeRegion'
    const fakeFilename = 'fakeFilename'

    const fakeCapacityProviderConfig = {
        CapacityProviderName: 'testCapacityProviderName',
        CapacityProviderArn: 'testCapacityProviderARN',
    }

    const fakeCapacityProviderResource = {
        LogicalResourceId: 'testLogicalResourceId',
        PhysicalResourceId: 'testPhysicalResourceId',
    }

    const regionPath = path.join('/tmp/aws-toolkit-vscode/lambda', fakeRegion)
    const functionPath = path.join(regionPath, fakeCapacityProviderConfig.CapacityProviderName)
    const filePath = path.join(functionPath, fakeFilename)

    let testNode: LambdaCapacityProviderNode

    let editLambdaStub: sinon.SinonStub

    before(async function () {
        await fs.mkdir(functionPath)
        await fs.writeFile(filePath, 'fakefilecontent')

        // Stub the editLambdaCommand to return the function path
        editLambdaStub = sinon.stub(editLambdaModule, 'editLambdaCommand').resolves(functionPath)

        testNode = new LambdaCapacityProviderNode(
            parentNode,
            'someregioncode',
            fakeCapacityProviderResource,
            contextValueLambdaCapacityProvider
        )
    })

    after(async function () {
        await fs.delete(regionPath, { recursive: true })
        editLambdaStub.restore()
    })

    it('instantiates without issue', async function () {
        assert.ok(testNode)
    })

    it('initializes the parent node', async function () {
        assert.strictEqual(testNode.parent, parentNode, 'unexpected parent node')
    })

    it('initializes the region code', async function () {
        assert.strictEqual(testNode.regionCode, 'someregioncode')
    })

    it('initializes the label', async function () {
        assert.strictEqual(testNode.label, fakeCapacityProviderResource.LogicalResourceId)
    })

    it('initializes the functionName', async function () {
        assert.strictEqual(testNode.name, fakeCapacityProviderResource.LogicalResourceId)
    })
})
