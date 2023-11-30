/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as model from '../../../codewhisperer/models/model'
import * as startTransformByQ from '../../../codewhisperer/commands/startTransformByQ'
import proxyquire from 'proxyquire'
import { HttpResponse } from 'aws-sdk'
import * as codeWhisperer from '../../../codewhisperer/client/codewhisperer'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'
import { getTestWindow } from '../../shared/vscode/window'
import { stopTransformByQMessage } from '../../../codewhisperer/models/constants'
import {
    convertDateToTimestamp,
    convertToTimeString,
    throwIfCancelled,
    stopJob,
    pollTransformationJob,
    validateProjectSelection,
} from '../../../codewhisperer/service/transformByQHandler'

describe('transformByQ', function () {
    afterEach(function () {
        sinon.restore()
    })

    it('WHEN converting short duration in milliseconds THEN converts correctly', async function () {
        const durationTimeString = convertToTimeString(10 * 1000)
        assert.strictEqual(durationTimeString, '10 sec')
    })

    it('WHEN converting medium duration in milliseconds THEN converts correctly', async function () {
        const durationTimeString = convertToTimeString(65 * 1000)
        assert.strictEqual(durationTimeString, '1 min 5 sec')
    })

    it('WHEN converting long duration in milliseconds THEN converts correctly', async function () {
        const durationTimeString = convertToTimeString(3700 * 1000)
        assert.strictEqual(durationTimeString, '1 hr 1 min')
    })

    it('WHEN converting date object to timestamp THEN converts correctly', async function () {
        const date = new Date(2023, 0, 1, 0, 0, 0, 0)
        const timestamp = convertDateToTimestamp(date)
        assert.strictEqual(timestamp, '01/01/23, 12:00 AM')
    })

    it('WHEN job status is cancelled THEN error is thrown', async function () {
        model.transformByQState.setToCancelled()
        assert.throws(() => {
            throwIfCancelled()
        }, new model.TransformByQStoppedError())
    })

    it('WHEN job is stopped THEN status is updated to cancelled', async function () {
        const testWindow = getTestWindow()
        testWindow.onDidShowMessage(message => {
            if (message.message === stopTransformByQMessage) {
                message.selectItem(startTransformByQ.stopTransformByQButton)
            }
        })
        model.transformByQState.setToRunning()
        await startTransformByQ.confirmStopTransformByQ('abc-123')
        assert.strictEqual(model.transformByQState.getStatus(), 'Cancelled')
    })

    it('WHEN validateProjectSelection called on valid project THEN correctly extracts JDK8 version', async function () {
        const findFilesStub = sinon.stub(vscode.workspace, 'findFiles')
        findFilesStub.onFirstCall().resolves([vscode.Uri.file('/user/sample/project/ClassFile.class')])
        findFilesStub.onSecondCall().resolves([vscode.Uri.file('/user/sample/project/pom.xml')])

        const spawnSyncResult = {
            stdout: 'major version: 52',
            stderr: '',
            error: undefined,
            status: 0,
            pid: 12345,
            signal: undefined,
            output: ['', 'major version: 52', ''],
        }
        const spawnSyncStub = sinon.stub().returns(spawnSyncResult)

        const { validateProjectSelection } = proxyquire('../../../codewhisperer/service/transformByQHandler', {
            child_process: { spawnSync: spawnSyncStub },
        })

        const dummyQuickPickItem: vscode.QuickPickItem = {
            label: 'SampleProject',
            description: '/dummy/path/here',
        }
        await assert.doesNotReject(async () => {
            await validateProjectSelection(dummyQuickPickItem)
        })
        assert.strictEqual(model.transformByQState.getSourceJDKVersion(), '8')
    })

    it('WHEN validateProjectSelection called on project with no class files THEN throws error', async function () {
        const findFilesStub = sinon.stub(vscode.workspace, 'findFiles')
        findFilesStub.onFirstCall().resolves([])
        const dummyQuickPickItem: vscode.QuickPickItem = {
            label: 'SampleProject',
            description: '/dummy/path/here',
        }

        await assert.rejects(
            async () => {
                await validateProjectSelection(dummyQuickPickItem)
            },
            {
                name: 'Error',
                message: 'No Java projects found',
            }
        )
    })

    it('WHEN stop job called with valid jobId THEN stop API called', async function () {
        const stopJobStub = sinon.stub(codeWhisperer.codeWhispererClient, 'codeModernizerStopCodeTransformation')
        await stopJob('dummyId')
        sinon.assert.calledWithExactly(stopJobStub, { transformationJobId: 'dummyId' })
    })

    it('WHEN stop job that has not been started THEN stop API not called', async function () {
        const stopJobStub = sinon.stub(codeWhisperer.codeWhispererClient, 'codeModernizerStopCodeTransformation')
        await stopJob('')
        sinon.assert.notCalled(stopJobStub)
    })

    it('WHEN polling completed job THEN returns status as completed', async function () {
        const mockJobResponse = {
            $response: {
                data: {
                    transformationJob: { status: 'COMPLETED' },
                },
                requestId: 'requestId',
                hasNextPage: () => false,
                error: undefined,
                nextPage: () => undefined,
                redirectCount: 0,
                retryCount: 0,
                httpResponse: new HttpResponse(),
            },
            transformationJob: { status: 'COMPLETED' },
        }
        sinon.stub(codeWhisperer.codeWhispererClient, 'codeModernizerGetCodeTransformation').resolves(mockJobResponse)
        model.transformByQState.setToSucceeded()
        const status = await pollTransformationJob('dummyId', CodeWhispererConstants.validStatesForCheckingDownloadUrl)
        assert.strictEqual(status, 'COMPLETED')
    })

    it(`WHEN process history called THEN returns details of last run job`, async function () {
        const actual = startTransformByQ.processHistory(
            [],
            '01/01/23, 12:00 AM',
            'my-module',
            'Succeeded',
            '20 sec',
            '123'
        )
        const expected = [
            {
                timestamp: '01/01/23, 12:00 AM',
                module: 'my-module',
                status: 'Succeeded',
                duration: '20 sec',
                id: '123',
            },
        ]
        assert.deepStrictEqual(actual, expected)
    })
})
