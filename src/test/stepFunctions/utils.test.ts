/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { IAM } from 'aws-sdk'
import * as sinon from 'sinon'
import { isStepFunctionsRole, StateMachineGraphCache, isDocumentValid } from '../../stepFunctions/utils'
import * as vscode from 'vscode'

const REQUEST_BODY = 'request body string'
const ASSET_URL = 'https://something'
const FILE_PATH = '/some/path'
const STORAGE_KEY = 'KEY'

describe('StateMachineGraphCache', () => {
    describe('updateCachedFile', () => {
        it('downloads a file when it is not in cache and stores it', async () => {
            const globalStorage = {
                update: sinon.spy(),
                get: sinon.stub().returns(undefined),
            }

            const getFileData = sinon.stub().resolves(REQUEST_BODY)
            const fileExists = sinon
                .stub()
                .onFirstCall()
                .resolves(false)
                .onSecondCall()
                .resolves(true)

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
                lastDownloadedURLKey: STORAGE_KEY,
                currentURL: ASSET_URL,
                filePath: FILE_PATH,
            })

            assert.ok(globalStorage.update.calledWith(STORAGE_KEY, ASSET_URL))
            assert.ok(writeFile.calledWith(FILE_PATH, REQUEST_BODY))
        })

        it('downloads and stores a file when cached file exists but url has been updated', async () => {
            const globalStorage = {
                update: sinon.spy(),
                get: sinon.stub().returns('https://old-url'),
            }

            const getFileData = sinon.stub().resolves(REQUEST_BODY)
            const fileExists = sinon
                .stub()
                .onFirstCall()
                .resolves(true)
                .onSecondCall()
                .resolves(true)

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
                lastDownloadedURLKey: STORAGE_KEY,
                currentURL: ASSET_URL,
                filePath: FILE_PATH,
            })

            assert.ok(globalStorage.update.calledWith(STORAGE_KEY, ASSET_URL))
            assert.ok(writeFile.calledWith(FILE_PATH, REQUEST_BODY))
        })

        it('it does not store data when file exists and url for it is same', async () => {
            const globalStorage = {
                update: sinon.spy(),
                get: sinon.stub().returns(ASSET_URL),
            }

            const getFileData = sinon.stub().resolves(REQUEST_BODY)
            const fileExists = sinon
                .stub()
                .onFirstCall()
                .resolves(true)
                .onSecondCall()
                .resolves(true)

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
                lastDownloadedURLKey: STORAGE_KEY,
                currentURL: ASSET_URL,
                filePath: FILE_PATH,
            })

            assert.ok(globalStorage.update.notCalled)
            assert.ok(writeFile.notCalled)
        })

        it('creates assets directory when it does not exist', async () => {
            const globalStorage = {
                update: sinon.spy(),
                get: sinon.stub().returns(undefined),
            }

            const getFileData = sinon.stub().resolves(REQUEST_BODY)
            const fileExists = sinon
                .stub()
                .onFirstCall()
                .resolves(false)
                .onSecondCall()
                .resolves(false)

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
                lastDownloadedURLKey: STORAGE_KEY,
                currentURL: ASSET_URL,
                filePath: FILE_PATH,
            })

            assert.ok(globalStorage.update.calledWith(STORAGE_KEY, ASSET_URL))
            assert.ok(writeFile.calledWith(FILE_PATH, REQUEST_BODY))
            assert.ok(makeDir.calledWith(dirPath))
        })
    })
})

describe('isStepFunctionsRole', () => {
    const baseIamRole: IAM.Role = {
        Path: '',
        RoleName: '',
        RoleId: 'myRole',
        Arn: 'arn:aws:iam::123456789012:role/myRole',
        CreateDate: new Date(),
    }

    it('return true if the Step Functions service principal is in the AssumeRolePolicyDocument', () => {
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

    it('returns false if the role does not have an AssumeRolePolicyDocument', () => {
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

describe('isDocumentValid', async () => {
    it('returns true for valid ASL', async () => {
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

        let textDocument = await vscode.workspace.openTextDocument({ language: 'asl' })

        const isValid = await isDocumentValid(aslText, textDocument)
        assert.ok(isValid)
    })

    it('returns true for ASL with invalid arns', async () => {
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

        let textDocument = await vscode.workspace.openTextDocument({ language: 'asl' })

        const isValid = await isDocumentValid(aslText, textDocument)
        assert.ok(isValid)
    })

    it('returns false for invalid ASL', async () => {
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

        let textDocument = await vscode.workspace.openTextDocument({ language: 'asl' })

        const isValid = await isDocumentValid(aslText, textDocument)

        assert.ok(!isValid)
    })
})
