/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import { TestAWSTreeNode } from '../../shared/treeview/nodes/testAWSTreeNode'
import path from 'path'
import { LambdaFunctionFolderNode } from '../../../lambda/explorer/lambdaFunctionFolderNode'
import { fs } from '../../../shared/fs/fs'

describe('LambdaFunctionFileNode', function () {
    const fakeFunctionConfig = {
        FunctionName: 'testFunctionName',
        FunctionArn: 'testFunctionARN',
    }
    const fakeRegion = 'fakeRegion'
    const fakeSubFolder = 'fakeSubFolder'
    const fakeFile = 'fakeFilename'
    const functionNode = new LambdaFunctionNode(new TestAWSTreeNode('test node'), fakeRegion, fakeFunctionConfig)

    const regionPath = path.join('/tmp/aws-toolkit-vscode/lambda', fakeRegion)
    const functionPath = path.join(regionPath, fakeFunctionConfig.FunctionName)
    const subFolderPath = path.join(functionPath, fakeSubFolder)

    let testNode: LambdaFunctionFolderNode

    before(async function () {
        await fs.mkdir(subFolderPath)
        await fs.writeFile(path.join(subFolderPath, fakeFile), 'fakefilecontent')

        testNode = new LambdaFunctionFolderNode(functionNode, fakeSubFolder, subFolderPath)
    })

    after(async function () {
        await fs.delete(regionPath, { recursive: true })
    })

    it('instantiates without issue', function () {
        assert.ok(testNode)
    })

    it('initializes the parent node', function () {
        assert.equal(testNode.parent, functionNode, 'unexpected parent node')
    })

    it('initializes the label', function () {
        assert.equal(testNode.label, fakeSubFolder)
    })

    it('loads function files', async function () {
        const functionFiles = await testNode.loadFunctionFiles()
        assert.equal(functionFiles.length, 1)
        assert.equal(functionFiles[0].label, fakeFile)
    })
})
