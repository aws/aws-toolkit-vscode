/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { IAM } from 'aws-sdk'
import * as fs from 'fs-extra'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { isDocumentValid, isStepFunctionsRole, StateMachineGraphCache } from '../../stepFunctions/utils'

const requestBody = 'request body string'
const assetUrl = 'https://something'
const filePath = '/some/path'
const storageKey = 'KEY'
let tempFolder = ''

describe('StateMachineGraphCache', function () {
    before(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
    })

    after(async function () {
        await fs.remove(tempFolder)
    })

    describe('updateCachedFile', function () {
        it('downloads a file when it is not in cache and stores it', async function () {
            const globalStorage = {
                keys: () => [],
                update: sinon.spy(),
                get: sinon.stub().returns(undefined),
            }

            const getFileData = sinon.stub().resolves(requestBody)
            const fileExists = sinon.stub().onFirstCall().resolves(false).onSecondCall().resolves(true)

            const writeFile = sinon.spy()

            const cache = new StateMachineGraphCache({
                getFileData,
                fileExists,
                writeFile,
                cssFilePath: '',
                jsFilePath: '',
                dirPath: tempFolder,
            })

            await cache.updateCachedFile({
                globalStorage,
                lastDownloadedURLKey: storageKey,
                currentURL: assetUrl,
                filePath: filePath,
            })

            assert.ok(globalStorage.update.calledWith(storageKey, assetUrl))
            assert.ok(writeFile.calledWith(filePath, requestBody))
        })

        it('downloads and stores a file when cached file exists but url has been updated', async function () {
            const globalStorage = {
                keys: () => [],
                update: sinon.spy(),
                get: sinon.stub().returns('https://old-url'),
            }

            const getFileData = sinon.stub().resolves(requestBody)
            const fileExists = sinon.stub().onFirstCall().resolves(true).onSecondCall().resolves(true)

            const writeFile = sinon.spy()

            const cache = new StateMachineGraphCache({
                getFileData,
                fileExists,
                writeFile,
                cssFilePath: '',
                jsFilePath: '',
                dirPath: tempFolder,
            })

            await cache.updateCachedFile({
                globalStorage,
                lastDownloadedURLKey: storageKey,
                currentURL: assetUrl,
                filePath: filePath,
            })

            assert.ok(globalStorage.update.calledWith(storageKey, assetUrl))
            assert.ok(writeFile.calledWith(filePath, requestBody))
        })

        it('it does not store data when file exists and url for it is same', async function () {
            const globalStorage = {
                keys: () => [],
                update: sinon.spy(),
                get: sinon.stub().returns(assetUrl),
            }

            const getFileData = sinon.stub().resolves(requestBody)
            const fileExists = sinon.stub().onFirstCall().resolves(true).onSecondCall().resolves(true)

            const writeFile = sinon.spy()

            const cache = new StateMachineGraphCache({
                getFileData,
                fileExists,
                writeFile,
                cssFilePath: '',
                jsFilePath: '',
                dirPath: '',
            })

            await cache.updateCachedFile({
                globalStorage,
                lastDownloadedURLKey: storageKey,
                currentURL: assetUrl,
                filePath: filePath,
            })

            assert.ok(globalStorage.update.notCalled)
            assert.ok(writeFile.notCalled)
        })
        it('it passes if both files required exist', async function () {
            const getFileData = sinon.stub().resolves(true)
            const fileExists = sinon.stub().resolves(true)

            const writeFile = sinon.spy()

            const cache = new StateMachineGraphCache({
                getFileData,
                fileExists,
                writeFile,
                cssFilePath: '',
                jsFilePath: '',
                dirPath: '',
            })

            await cache.confirmCacheExists()

            assert.ok(fileExists.calledTwice)
        })
        it('it rejects if both files required do not exist on filesystem', async function () {
            const getFileData = sinon.stub()
            const fileExists = sinon.stub().onFirstCall().resolves(true).onSecondCall().resolves(false)

            const writeFile = sinon.spy()

            const cache = new StateMachineGraphCache({
                getFileData,
                fileExists,
                writeFile,
                cssFilePath: 'one',
                jsFilePath: 'two',
                dirPath: '',
            })

            await assert.rejects(cache.confirmCacheExists())
        })

        it('creates assets directory when it does not exist', async function () {
            const globalStorage = {
                keys: () => [],
                update: sinon.spy(),
                get: sinon.stub().returns(undefined),
            }

            const getFileData = sinon.stub().resolves(requestBody)
            const fileExists = sinon.stub().onFirstCall().resolves(false).onSecondCall().resolves(false)

            const writeFile = sinon.spy()
            const makeDir = sinon.spy()

            const dirPath = '/path/to/assets'

            const cache = new StateMachineGraphCache({
                getFileData,
                fileExists,
                writeFile,
                makeDir,
                cssFilePath: '',
                jsFilePath: '',
                dirPath,
            })

            await cache.updateCachedFile({
                globalStorage,
                lastDownloadedURLKey: storageKey,
                currentURL: assetUrl,
                filePath: filePath,
            })

            assert.ok(globalStorage.update.calledWith(storageKey, assetUrl))
            assert.ok(writeFile.calledWith(filePath, requestBody))
            assert.ok(makeDir.calledWith(dirPath))
        })
    })
})

describe('isStepFunctionsRole', function () {
    const baseIamRole: IAM.Role = {
        Path: '',
        RoleName: '',
        RoleId: 'myRole',
        Arn: 'arn:aws:iam::123456789012:role/myRole',
        CreateDate: new Date(),
    }

    it('return true if the Step Functions service principal is in the AssumeRolePolicyDocument', function () {
        const role: IAM.Role = {
            ...baseIamRole,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: {
                            Service: ['states.amazonaws.com'],
                        },
                        Action: ['sts:AssumeRole'],
                    },
                ],
            }),
        }
        assert.ok(isStepFunctionsRole(role))
    })

    it('returns false if the role does not have an AssumeRolePolicyDocument', function () {
        assert.ok(!isStepFunctionsRole(baseIamRole))
    })

    it("returns false if the AssumeRolePolicyDocument does not contain Step Functions' service principal", () => {
        const role: IAM.Role = {
            ...baseIamRole,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: {
                            Service: ['lambda.amazonaws.com'],
                        },
                        Action: ['sts:AssumeRole'],
                    },
                ],
            }),
        }
        assert.ok(!isStepFunctionsRole(role))
    })
})

describe('isDocumentValid', async function () {
    it('returns true for valid ASL', async function () {
        const aslText = `
            {
                "StartAt": "FirstMatchState",
                "States": {
                    "FirstMatchState": {
                        "Type": "Task",
                        "Resource": "arn:aws:lambda:us-west-2:000000000000:function:OnFirstMatch",
                        "End": true
                    }
                }
            } `

        const textDocument = await vscode.workspace.openTextDocument({ language: 'asl' })

        const isValid = await isDocumentValid(aslText, textDocument)
        assert.ok(isValid)
    })

    it('returns true for ASL with invalid arns', async function () {
        const aslText = `
            {
                "StartAt": "FirstMatchState",
                "States": {
                    "FirstMatchState": {
                        "Type": "Task",
                        "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:OnFirstMatch",
                        "End": true
                    }
                }
            } `

        const textDocument = await vscode.workspace.openTextDocument({ language: 'asl' })

        const isValid = await isDocumentValid(aslText, textDocument)
        assert.ok(isValid)
    })

    it('returns false for invalid ASL', async function () {
        const aslText = `
            {
                "StartAt": "Does not exist",
                "States": {
                    "FirstMatchState": {
                        "Type": "Task",
                        "Resource": "arn:aws:lambda:us-west-2:000000000000:function:OnFirstMatch",
                        "End": true
                    }
                }
            } `

        const textDocument = await vscode.workspace.openTextDocument({ language: 'asl' })

        const isValid = await isDocumentValid(aslText, textDocument)

        assert.ok(!isValid)
    })
})
