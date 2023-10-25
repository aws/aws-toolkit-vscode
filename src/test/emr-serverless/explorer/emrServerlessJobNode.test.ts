/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { EMRServerless } from 'aws-sdk'
import * as sinon from 'sinon'
import { EmrServerlessApplicationNode } from '../../../emr-serverless/explorer/emrServerlessApplicationNode'
import { EmrServerlessJobNode } from '../../../emr-serverless/explorer/emrServerlessJobNode'
import { EmrServerlessClient, EmrApplication } from '../../../shared/clients/emrServerlessClient'

describe('emrServerlessJobNode', () => {
    let emrserverless: EmrServerlessClient
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        emrserverless = new EmrServerlessClient('')
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('should return correct dashboard URL', async () => {
        const mockUrl = 'http://example.com'
        sinon.stub(emrserverless, 'getDashboardForJobRun').callsFake(async function () {
            return mockUrl
        })
        const jobNode = new EmrServerlessJobNode(
            {} as EmrServerlessApplicationNode,
            emrserverless,
            {} as EmrApplication,
            {} as EMRServerless.JobRunSummary
        )

        const url = await jobNode.getDashboard()

        assert.strictEqual(url, mockUrl)
    })
})
