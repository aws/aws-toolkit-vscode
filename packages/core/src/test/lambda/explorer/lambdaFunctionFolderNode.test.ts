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
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'

describe('LambdaFunctionFolderNode', function () {
    const fakeFunctionConfig = {
        FunctionName: 'testFunctionName',
        FunctionArn: 'testFunctionARN',
    }
    const fakeRegion = 'fakeRegion'
    const fakeSubFolder = 'fakeSubFolder'
    const fakeFile = 'fakeFilename'

    let tempFolder: string
    let subFolderPath: string
    let functionNode: LambdaFunctionNode
    let testNode: LambdaFunctionFolderNode

    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        subFolderPath = path.join(tempFolder, fakeSubFolder)

        await fs.mkdir(subFolderPath)
        await fs.writeFile(path.join(subFolderPath, fakeFile), 'fakefilecontent')

        functionNode = new LambdaFunctionNode(new TestAWSTreeNode('test node'), fakeRegion, fakeFunctionConfig)
        testNode = new LambdaFunctionFolderNode(functionNode, fakeSubFolder, subFolderPath)
    })

    afterEach(async function () {
        await fs.delete(tempFolder, { recursive: true })
    })

    it('FolderNode instantiates without issue', function () {
        assert.ok(testNode)
    })

    it('FolderNode initializes the parent node', function () {
        assert.equal(testNode.parent, functionNode, 'unexpected parent node')
    })

    it('FolderNode initializes the label', function () {
        assert.equal(testNode.label, fakeSubFolder)
    })

    it('loads function files', async function () {
        const functionFiles = await testNode.loadFunctionFiles()
        assert.equal(functionFiles.length, 1)
        assert.equal(functionFiles[0].label, fakeFile)
    })
})
