/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import { getDashboard } from '../../../emr-serverless/commands/getDashboard'
import { getOpenExternalStub } from '../../globalSetup.test'
import { EmrServerlessJobNode } from '../../../emr-serverless/explorer/emrServerlessJobNode'
import { EmrServerlessApplicationNode } from '../../../emr-serverless/explorer/emrServerlessApplicationNode'
import { EMRServerless } from 'aws-sdk'
import { EmrApplication, EmrServerlessClient } from '../../../shared/clients/emrServerlessClient'
import { FakeCommands } from '../../shared/vscode/fakeCommands'

describe('getDashboardCommand', function () {
    const appId = 'app01'
    const jobId = 'jobrun01'
    const parentNode: EmrServerlessApplicationNode = {} as EmrServerlessApplicationNode
    let sandbox: sinon.SinonSandbox
    let emrServerlessClient: EmrServerlessClient

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        emrServerlessClient = new EmrServerlessClient('')
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('gets the dashboard URl and opens it', async function () {
        getOpenExternalStub().resolves(true)

        const node = new EmrServerlessJobNode(
            parentNode,
            emrServerlessClient,
            { id: appId } as EmrApplication,
            { id: jobId } as EMRServerless.JobRunSummary
        )
        const sampleUrl = vscode.Uri.parse('http://example.com')
        const commands = new FakeCommands()
        const stub = sandbox
            .stub(emrServerlessClient, 'getDashboardForJobRun')
            .callsFake(async (calledAppId, calledJobId) => {
                assert.strictEqual(calledAppId, appId)
                assert.strictEqual(calledJobId, jobId)
                return sampleUrl.toString()
            })

        await getDashboard(node, commands)

        assert.strictEqual(stub.calledOnce, true)
        assert.ok(getOpenExternalStub().calledWith(sampleUrl))
    })
})
