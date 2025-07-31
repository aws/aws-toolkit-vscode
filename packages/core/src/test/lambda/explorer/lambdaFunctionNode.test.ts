/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as os from 'os'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import { TestAWSTreeNode } from '../../shared/treeview/nodes/testAWSTreeNode'
import path from 'path'
import { fs } from '../../../shared/fs/fs'
import {
    contextValueLambdaFunction,
    contextValueLambdaFunctionImportable,
} from '../../../lambda/explorer/lambdaFunctionNode'
import sinon from 'sinon'
import * as editLambdaModule from '../../../lambda/commands/editLambda'

describe('LambdaFunctionNode', function () {
    const parentNode = new TestAWSTreeNode('test node')
    const fakeRegion = 'fakeRegion'
    const fakeFilename = 'fakeFilename'

    const fakeFunctionConfig = {
        FunctionName: 'testFunctionName',
        FunctionArn: 'testFunctionARN',
    }

    const regionPath = path.join('/tmp/aws-toolkit-vscode/lambda', fakeRegion)
    const functionPath = path.join(regionPath, fakeFunctionConfig.FunctionName)
    const filePath = path.join(functionPath, fakeFilename)

    let testNode: LambdaFunctionNode

    let editLambdaStub: sinon.SinonStub

    before(async function () {
        await fs.mkdir(functionPath)
        await fs.writeFile(filePath, 'fakefilecontent')

        // Stub the editLambdaCommand to return the function path
        editLambdaStub = sinon.stub(editLambdaModule, 'editLambdaCommand').resolves(functionPath)

        testNode = new LambdaFunctionNode(
            parentNode,
            'someregioncode',
            fakeFunctionConfig,
            contextValueLambdaFunctionImportable
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
        assert.strictEqual(testNode.label, fakeFunctionConfig.FunctionName)
    })

    it('initializes the functionName', async function () {
        assert.strictEqual(testNode.functionName, fakeFunctionConfig.FunctionName)
    })

    it('initializes resourceUri', async function () {
        assert.strictEqual(testNode.resourceUri?.scheme, 'lambda')
        assert.strictEqual(testNode.resourceUri?.path, `someregioncode/${fakeFunctionConfig.FunctionName}`)
    })

    it('initializes the tooltip', async function () {
        assert.strictEqual(
            testNode.tooltip,
            `${fakeFunctionConfig.FunctionName}${os.EOL}${fakeFunctionConfig.FunctionArn}`
        )
    })

    it('loads function files', async function () {
        const functionFiles = await testNode.loadFunctionFiles(functionPath)
        assert.equal(functionFiles.length, 1)
        assert.equal(functionFiles[0].label, fakeFilename)
    })

    it('has child if importable', async function () {
        const childNodes = await testNode.getChildren()
        assert.ok(childNodes)
        assert.equal(childNodes.length, 1, 'Expected node to have one child, should be "failed to load resources"')
    })

    it('is not collapsible if not importable', async function () {
        const nonImportableNode = new LambdaFunctionNode(
            parentNode,
            fakeRegion,
            fakeFunctionConfig,
            contextValueLambdaFunction
        )
        const childNodes = await nonImportableNode.getChildren()
        assert.ok(childNodes)
        assert.equal(childNodes.length, 0, 'Expected node to have no children')
    })
})
