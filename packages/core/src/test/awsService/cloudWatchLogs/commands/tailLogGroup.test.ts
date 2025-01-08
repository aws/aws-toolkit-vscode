/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'

import assert from 'assert'
import { clearDocument, closeSession, tailLogGroup } from '../../../../awsService/cloudWatchLogs/commands/tailLogGroup'
import { StartLiveTailResponseStream } from '@aws-sdk/client-cloudwatch-logs'
import { LiveTailSessionRegistry } from '../../../../awsService/cloudWatchLogs/registry/liveTailSessionRegistry'
import { LiveTailSession } from '../../../../awsService/cloudWatchLogs/registry/liveTailSession'
import {
    TailLogGroupWizard,
    TailLogGroupWizardResponse,
} from '../../../../awsService/cloudWatchLogs/wizard/tailLogGroupWizard'
import { getTestWindow } from '../../../shared/vscode/window'
import { CloudWatchLogsSettings, uriToKey } from '../../../../awsService/cloudWatchLogs/cloudWatchLogsUtils'
import { DefaultAwsContext, ToolkitError, waitUntil } from '../../../../shared'
import { LiveTailCodeLensProvider } from '../../../../awsService/cloudWatchLogs/document/liveTailCodeLensProvider'

describe('TailLogGroup', function () {
    const testLogGroup = 'test-log-group'
    const testRegion = 'test-region'
    const testMessage = 'test-message'
    const testAwsAccountId = '1234'
    const testSource = 'test-source'
    const testAwsCredentials = {} as any as AWS.Credentials

    let sandbox: sinon.SinonSandbox
    let registry: LiveTailSessionRegistry
    let codeLensProvider: LiveTailCodeLensProvider
    let startLiveTailSessionSpy: sinon.SinonSpy
    let stopLiveTailSessionSpy: sinon.SinonSpy
    let cloudwatchSettingsSpy: sinon.SinonSpy
    let wizardSpy: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        registry = new LiveTailSessionRegistry()
        codeLensProvider = new LiveTailCodeLensProvider(registry)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('starts LiveTailSession and writes to document. Closes tab and asserts session gets closed.', async function () {
        sandbox.stub(DefaultAwsContext.prototype, 'getCredentialAccountId').returns(testAwsAccountId)
        sandbox.stub(DefaultAwsContext.prototype, 'getCredentials').returns(Promise.resolve(testAwsCredentials))

        const startTimestamp = 1732276800000 // 11-22-2024 12:00:00PM GMT
        const updateFrames: StartLiveTailResponseStream[] = [
            getSessionUpdateFrame(false, `${testMessage}-1`, startTimestamp + 1000),
            getSessionUpdateFrame(false, `${testMessage}-2`, startTimestamp + 2000),
            getSessionUpdateFrame(false, `${testMessage}-3`, startTimestamp + 3000),
        ]
        // Returns the configured update frames and then blocks until an AbortController is signaled.
        // This keeps the stream 'open', simulating an open network stream waiting for new events.
        // If the stream were to close, the event listeners in the TailLogGroup command would dispose,
        // breaking the 'closes tab closes session' assertions this test makes.
        const controller = new AbortController()
        const p = new Promise((resolve, reject) => {
            controller.signal.addEventListener('abort', () => {
                reject()
            })
        })
        async function* generator() {
            for (const frame of updateFrames) {
                yield frame
            }
            await p
        }

        startLiveTailSessionSpy = sandbox
            .stub(LiveTailSession.prototype, 'startLiveTailSession')
            .returns(Promise.resolve(generator()))
        stopLiveTailSessionSpy = sandbox
            .stub(LiveTailSession.prototype, 'stopLiveTailSession')
            .callsFake(async function () {
                return
            })
        wizardSpy = sandbox.stub(TailLogGroupWizard.prototype, 'run').callsFake(async function () {
            return getTestWizardResponse()
        })
        // Set maxLines to 1.
        cloudwatchSettingsSpy = sandbox.stub(CloudWatchLogsSettings.prototype, 'get').callsFake(() => {
            return 1
        })

        // The mock stream doesn't 'close', causing tailLogGroup to not return. If we `await`, it will never resolve.
        // Run it in the background and use waitUntil to poll its state. Due to the test setup, we expect this to throw
        // after the abortController is fired at the end of the test.
        void tailLogGroup(registry, testSource, codeLensProvider, {
            groupName: testLogGroup,
            regionName: testRegion,
        }).catch((e) => {
            const err = e as Error
            assert.strictEqual(err.message.startsWith('Unexpected on-stream exception while tailing session:'), true)
        })
        await waitUntil(async () => registry.size !== 0, { interval: 100, timeout: 1000 })

        // registry is asserted to have only one entry, so this is assumed to be the session that was
        // started in this test.
        let sessionUri: vscode.Uri | undefined
        for (const [_, session] of registry) {
            sessionUri = session.uri
        }
        if (sessionUri === undefined) {
            throw Error
        }

        assert.strictEqual(wizardSpy.calledOnce, true)
        assert.strictEqual(cloudwatchSettingsSpy.calledOnce, true)
        assert.strictEqual(startLiveTailSessionSpy.calledOnce, true)
        assert.strictEqual(registry.size, 1)

        // Validate writing to the document.
        // MaxLines is set to 1, and "testMessage3" is the last event in the stream, its contents should be the only thing in the doc.
        const window = getTestWindow()
        const document = window.activeTextEditor?.document
        assert.strictEqual(sessionUri.toString(), document?.uri.toString())
        const doesDocumentContainExpectedContent = await waitUntil(
            async () => document?.getText().trim() === `12:00:03\t${testMessage}-3`,
            { interval: 100, timeout: 1000 }
        )
        assert.strictEqual(doesDocumentContainExpectedContent, true)

        // Test that closing all tabs the session's document is open in will cause the session to close
        let tabs: vscode.Tab[] = []
        for (const tabGroup of window.tabGroups.all) {
            tabs = tabs.concat(getLiveTailSessionTabsFromTabGroup(tabGroup, sessionUri!))
        }
        await Promise.all(tabs.map((tab) => window.tabGroups.close(tab)))

        // Before the test ends, signal the abort controller, interrupting the mock response stream. This
        // causes `handleSessionStream` in TailLogGroup to throw, triggering the disposables to dispose.
        controller.abort()

        assert.strictEqual(registry.size, 0)
        assert.strictEqual(stopLiveTailSessionSpy.calledOnce, true)
    })

    it('throws if crendentials are undefined', async function () {
        sandbox.stub(DefaultAwsContext.prototype, 'getCredentials').returns(Promise.resolve(undefined))
        wizardSpy = sandbox.stub(TailLogGroupWizard.prototype, 'run').callsFake(async function () {
            return getTestWizardResponse()
        })
        await assert.rejects(async () => {
            await tailLogGroup(registry, testSource, codeLensProvider, {
                groupName: testLogGroup,
                regionName: testRegion,
            })
        }, ToolkitError)
    })

    it('closeSession removes session from registry and calls underlying stopLiveTailSession function.', function () {
        stopLiveTailSessionSpy = sandbox
            .stub(LiveTailSession.prototype, 'stopLiveTailSession')
            .callsFake(async function () {
                return
            })

        const session = new LiveTailSession({
            logGroupArn: testLogGroup,
            region: testRegion,
            awsCredentials: testAwsCredentials,
        })
        registry.set(uriToKey(session.uri), session)

        closeSession(session.uri, registry, testSource, codeLensProvider)
        assert.strictEqual(0, registry.size)
        assert.strictEqual(true, stopLiveTailSessionSpy.calledOnce)
    })

    it('clearDocument clears all text from document', async function () {
        const session = new LiveTailSession({
            logGroupArn: testLogGroup,
            region: testRegion,
            awsCredentials: testAwsCredentials,
        })
        const testData = 'blah blah blah'
        const document = await vscode.workspace.openTextDocument(session.uri)
        const edit = new vscode.WorkspaceEdit()
        edit.insert(document.uri, new vscode.Position(0, 0), testData)
        await vscode.workspace.applyEdit(edit)
        assert.strictEqual(document.getText(), testData)

        await clearDocument(document)
        assert.strictEqual(document.getText(), '')
    })

    function getLiveTailSessionTabsFromTabGroup(tabGroup: vscode.TabGroup, sessionUri: vscode.Uri): vscode.Tab[] {
        return tabGroup.tabs.filter((tab) => {
            if (tab.input instanceof vscode.TabInputText) {
                return sessionUri!.toString() === tab.input.uri.toString()
            }
        })
    }

    function getTestWizardResponse(): TailLogGroupWizardResponse {
        return {
            regionLogGroupSubmenuResponse: {
                region: testRegion,
                data: testLogGroup,
            },
            filterPattern: '',
            logStreamFilter: {
                type: 'all',
            },
        }
    }

    function getSessionUpdateFrame(
        isSampled: boolean,
        message: string,
        timestamp: number
    ): StartLiveTailResponseStream {
        return {
            sessionUpdate: {
                sessionMetadata: {
                    sampled: isSampled,
                },
                sessionResults: [
                    {
                        message: message,
                        timestamp: timestamp,
                    },
                ],
            },
        }
    }
})
