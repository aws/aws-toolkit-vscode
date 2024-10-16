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
import { asyncGenerator } from '../../../../shared/utilities/collectionUtils'
import {
    TailLogGroupWizard,
    TailLogGroupWizardResponse,
} from '../../../../awsService/cloudWatchLogs/wizard/tailLogGroupWizard'
import { getTestWindow } from '../../../shared/vscode/window'

describe('TailLogGroup', function () {
    const testLogGroup = 'test-log-group'
    const testRegion = 'test-region'
    const testMessage = 'test-message'

    let sandbox: sinon.SinonSandbox
    let registry: LiveTailSessionRegistry
    let startLiveTailSessionSpy: sinon.SinonSpy
    let stopLiveTailSessionSpy: sinon.SinonSpy
    let wizardSpy: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        registry = new LiveTailSessionRegistry()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('starts LiveTailSession and writes to document. Closes tab and asserts session gets closed.', async function () {
        wizardSpy = sandbox.stub(TailLogGroupWizard.prototype, 'run').callsFake(async function () {
            return getTestWizardResponse()
        })
        startLiveTailSessionSpy = sandbox
            .stub(LiveTailSession.prototype, 'startLiveTailSession')
            .callsFake(async function () {
                return getTestResponseStream()
            })
        stopLiveTailSessionSpy = sandbox
            .stub(LiveTailSession.prototype, 'stopLiveTailSession')
            .callsFake(async function () {
                return
            })
        await tailLogGroup(registry, {
            groupName: testLogGroup,
            regionName: testRegion,
        })
        assert.strictEqual(wizardSpy.calledOnce, true)
        assert.strictEqual(startLiveTailSessionSpy.calledOnce, true)
        assert.strictEqual(registry.size, 1)

        //registry is asserted to have only one entry, so this is assumed to be the session that was
        //started in this test.
        let sessionUri: vscode.Uri | undefined
        registry.forEach((session) => (sessionUri = session.uri))
        if (sessionUri === undefined) {
            throw Error
        }
        const document = getTestWindow().activeTextEditor?.document
        assert.strictEqual(sessionUri.toString(), document?.uri.toString())
        assert.strictEqual(document?.getText(), `12:00:00\t${testMessage}\n`)

        //Test that closing all tabs the session's document is open in will cause the session to close
        const window = getTestWindow()
        window.tabGroups.all.forEach(async (tabGroup) =>
            tabGroup.tabs.forEach(async (tab) => {
                if (tab.input instanceof vscode.TabInputText) {
                    if (sessionUri!.toString() === tab.input.uri.toString()) {
                        await window.tabGroups.close(tab)
                    }
                }
            })
        )
        assert.strictEqual(registry.size, 0)
        assert.strictEqual(stopLiveTailSessionSpy.calledOnce, true)
    })

    it('closeSession removes session from registry and calls underlying stopLiveTailSession function.', function () {
        stopLiveTailSessionSpy = sandbox
            .stub(LiveTailSession.prototype, 'stopLiveTailSession')
            .callsFake(async function () {
                return
            })
        const session = new LiveTailSession({
            logGroupName: testLogGroup,
            region: testRegion,
        })
        registry.set(session.uri, session)

        closeSession(session.uri, registry)
        assert.strictEqual(0, registry.size)
        assert.strictEqual(true, stopLiveTailSessionSpy.calledOnce)
    })

    it('clearDocument clears all text from document', async function () {
        const session = new LiveTailSession({
            logGroupName: testLogGroup,
            region: testRegion,
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

    function getTestResponseStream(): AsyncIterable<StartLiveTailResponseStream> {
        const sessionStartFrame: StartLiveTailResponseStream = {
            sessionStart: {
                logGroupIdentifiers: [testLogGroup],
            },
            sessionUpdate: undefined,
        }
        const sessionUpdateFrame: StartLiveTailResponseStream = {
            sessionUpdate: {
                sessionResults: [
                    {
                        message: testMessage,
                        timestamp: 876830400000,
                    },
                ],
            },
        }
        return asyncGenerator([sessionStartFrame, sessionUpdateFrame])
    }
})
