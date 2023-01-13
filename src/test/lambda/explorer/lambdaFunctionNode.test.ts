/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Lambda } from 'aws-sdk'
import * as os from 'os'
import {
    LambdaFunctionNode,
    contextLambda,
    contextLambdaImportableUploadable,
    contextLambdaUploadable,
    contextLambdaImportable,
} from '../../../lambda/explorer/lambdaFunctionNode'
import { samLambdaImportableRuntimes } from '../../../lambda/models/samLambdaRuntime'
import { TestAWSTreeNode } from '../../shared/treeview/nodes/testAWSTreeNode'

describe('LambdaFunctionNode', function () {
    const parentNode = new TestAWSTreeNode('test node')
    let testNode: LambdaFunctionNode
    let fakeFunctionConfig: Lambda.FunctionConfiguration

    before(function () {
        fakeFunctionConfig = {
            FunctionName: 'testFunctionName',
            FunctionArn: 'testFunctionARN',
        }

        testNode = new LambdaFunctionNode(parentNode, 'someregioncode', fakeFunctionConfig)
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

    it('initializes the tooltip', async function () {
        assert.strictEqual(
            testNode.tooltip,
            `${fakeFunctionConfig.FunctionName}${os.EOL}${fakeFunctionConfig.FunctionArn}`
        )
    })

    it('has no children', async function () {
        const childNodes = await testNode.getChildren()
        assert.ok(childNodes)
        assert.strictEqual(childNodes.length, 0, 'Expected node to have no children')
    })

    it('sets appropriate contextValue for importing and uploading', function () {
        const uploadableAndDownloadable: Lambda.FunctionConfiguration = {
            Runtime: samLambdaImportableRuntimes.first(),
            PackageType: 'Zip',
        }
        const onlyDownloadable: Lambda.FunctionConfiguration = {
            Runtime: samLambdaImportableRuntimes.first(),
            PackageType: 'Image',
        }
        const onlyUploadable: Lambda.FunctionConfiguration = { Runtime: 'unsupportedRuntime', PackageType: 'Zip' }
        const neither: Lambda.FunctionConfiguration = { Runtime: 'unsupportedRuntime', PackageType: 'Image' }

        testNode = new LambdaFunctionNode(parentNode, 'someregioncode', uploadableAndDownloadable)
        assert.strictEqual(testNode.contextValue, contextLambdaImportableUploadable)

        testNode = new LambdaFunctionNode(parentNode, 'someregioncode', onlyDownloadable)
        assert.strictEqual(testNode.contextValue, contextLambdaImportable)

        testNode = new LambdaFunctionNode(parentNode, 'someregioncode', onlyUploadable)
        assert.strictEqual(testNode.contextValue, contextLambdaUploadable)

        testNode = new LambdaFunctionNode(parentNode, 'someregioncode', neither)
        assert.strictEqual(testNode.contextValue, contextLambda)
    })
})
