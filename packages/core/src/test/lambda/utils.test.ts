/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import {
    getLambdaDetails,
    getTempLocation,
    getTempRegionLocation,
    getFunctionInfo,
    setFunctionInfo,
    compareCodeSha,
} from '../../lambda/utils'
import { DefaultLambdaClient } from '../../shared/clients/lambdaClient'
import { fs } from '../../shared/fs/fs'
import { tempDirPath } from '../../shared/filesystemUtilities'
import path from 'path'

describe('lambda utils', function () {
    const mockLambda = {
        name: 'test-function',
        region: 'us-east-1',
        configuration: { FunctionName: 'test-function' },
    }
    describe('getLambdaDetails', function () {
        it('returns valid filenames and function names', function () {
            const jsNonNestedParsedName = getLambdaDetails({
                Runtime: 'nodejs16.x',
                Handler: 'app.lambda_handler',
            })
            const pyNonNestedParsedName = getLambdaDetails({
                Runtime: 'python3.8',
                Handler: 'app.lambda_handler',
            })
            const jsNestedParsedName = getLambdaDetails({
                Runtime: 'nodejs16.x',
                Handler: 'asdf/jkl/app.lambda_handler',
            })
            const node18ModuleParsedName = getLambdaDetails({
                Runtime: 'nodejs18.x',
                Handler: 'asdf/jkl/app.lambda_handler',
            })
            const PyNestedParsedName = getLambdaDetails({
                Runtime: 'python3.8',
                Handler: 'asdf/jkl/app.lambda_handler',
            })
            assert.strictEqual(jsNonNestedParsedName.fileName, 'app.js')
            assert.strictEqual(pyNonNestedParsedName.fileName, 'app.py')
            assert.strictEqual(jsNestedParsedName.fileName, 'asdf/jkl/app.js')
            assert.strictEqual(node18ModuleParsedName.fileName, 'asdf/jkl/app.mjs')
            assert.strictEqual(PyNestedParsedName.fileName, 'asdf/jkl/app.py')
            assert.strictEqual(jsNonNestedParsedName.functionName, 'lambda_handler')
            assert.strictEqual(pyNonNestedParsedName.functionName, 'lambda_handler')
            assert.strictEqual(jsNestedParsedName.functionName, 'lambda_handler')
            assert.strictEqual(PyNestedParsedName.functionName, 'lambda_handler')
        })

        it('throws if the handler is not a supported runtime', async function () {
            // unsupported runtime for import
            assert.throws(() =>
                getLambdaDetails({
                    Runtime: 'dotnetcore3.1',
                    Handler: 'HelloWorld::HelloWorld.Function::FunctionHandler',
                })
            )
            // runtime that isn't present, period
            assert.throws(() => getLambdaDetails({ Runtime: 'COBOL-60', Handler: 'asdf.asdf' }))
        })
    })

    describe('getTempLocation', function () {
        it('returns correct temp location path', function () {
            const result = getTempLocation('test-function', 'us-east-1')
            const expected = path.join(tempDirPath, 'lambda', 'us-east-1', 'test-function')
            assert.strictEqual(result, expected)
        })
    })

    describe('getTempRegionLocation', function () {
        it('returns correct temp region path', function () {
            const result = getTempRegionLocation('us-west-2')
            const expected = path.join(tempDirPath, 'lambda', 'us-west-2')
            assert.strictEqual(result, expected)
        })
    })

    describe('getFunctionInfo', function () {
        afterEach(function () {
            sinon.restore()
        })

        it('returns parsed data when file exists', async function () {
            const mockData = { lastDeployed: 123456, undeployed: false, sha: 'test-sha' }
            sinon.stub(fs, 'readFileText').resolves(JSON.stringify(mockData))

            const result = await getFunctionInfo(mockLambda)
            assert.deepStrictEqual(result, mockData)
        })

        it('returns specific field when requested', async function () {
            const mockData = { lastDeployed: 123456, undeployed: false, sha: 'test-sha' }
            sinon.stub(fs, 'readFileText').resolves(JSON.stringify(mockData))

            const result = await getFunctionInfo(mockLambda, 'sha')
            assert.strictEqual(result, 'test-sha')
        })

        it('returns empty object when file does not exist', async function () {
            sinon.stub(fs, 'readFileText').rejects(new Error('File not found'))

            const result = await getFunctionInfo(mockLambda)
            assert.deepStrictEqual(result, {})
        })
    })

    describe('setFunctionInfo', function () {
        afterEach(function () {
            sinon.restore()
        })

        it('merges with existing data', async function () {
            const existingData = { lastDeployed: 123456, undeployed: true, sha: 'old-sha', handlerFile: 'index.js' }
            sinon.stub(fs, 'readFileText').resolves(JSON.stringify(existingData))
            const writeStub = sinon.stub(fs, 'writeFile').resolves()
            sinon.stub(DefaultLambdaClient.prototype, 'getFunction').resolves({
                Configuration: { CodeSha256: 'new-sha' },
            } as any)

            await setFunctionInfo(mockLambda, { undeployed: false })

            assert(writeStub.calledOnce)
            const writtenData = JSON.parse(writeStub.firstCall.args[1] as string)
            assert.strictEqual(writtenData.lastDeployed, 123456)
            assert.strictEqual(writtenData.undeployed, false)
            assert.strictEqual(writtenData.sha, 'new-sha')
            assert.strictEqual(writtenData.handlerFile, 'index.js')
        })
    })

    describe('compareCodeSha', function () {
        afterEach(function () {
            sinon.restore()
        })

        it('returns true when local and remote SHA match', async function () {
            sinon.stub(fs, 'readFileText').resolves(JSON.stringify({ sha: 'same-sha' }))
            sinon.stub(DefaultLambdaClient.prototype, 'getFunction').resolves({
                Configuration: { CodeSha256: 'same-sha' },
            } as any)

            const result = await compareCodeSha(mockLambda)
            assert.strictEqual(result, true)
        })

        it('returns false when local and remote SHA differ', async function () {
            sinon.stub(fs, 'readFileText').resolves(JSON.stringify({ sha: 'local-sha' }))
            sinon.stub(DefaultLambdaClient.prototype, 'getFunction').resolves({
                Configuration: { CodeSha256: 'remote-sha' },
            } as any)

            const result = await compareCodeSha(mockLambda)
            assert.strictEqual(result, false)
        })
    })
})
