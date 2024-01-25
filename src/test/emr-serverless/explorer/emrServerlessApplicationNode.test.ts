/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { EMRServerless } from 'aws-sdk'
import * as sinon from 'sinon'
import { EmrServerlessApplicationNode } from '../../../emr-serverless/explorer/emrServerlessApplicationNode'
import { EmrServerlessJobNode } from '../../../emr-serverless/explorer/emrServerlessJobNode'
import { EmrServerlessNode } from '../../../emr-serverless/explorer/emrServerlessNode'
import { EmrServerlessClient, EmrApplication } from '../../../shared/clients/emrServerlessClient'
import { assertNodeListOnlyHasPlaceholderNode } from '../../utilities/explorerNodeAssertions'
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'
import { createEmrServerlessClient } from './emrServerlessNode.test'

describe('emrServerlessApplicationNode', () => {
    let emrserverless: EmrServerlessClient
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        emrserverless = new EmrServerlessClient('')
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('returns placeholder node if no children are present', async function () {
        const emrsClient = createEmrServerlessClient()
        const node = new EmrServerlessApplicationNode({} as EmrServerlessNode, emrsClient, {} as EmrApplication)
        assertNodeListOnlyHasPlaceholderNode(await node.getChildren())
    })

    it('Gets job runs', async function () {
        const emrsClient = createEmrServerlessClient({
            jobs: [
                { applicationId: 'app1', id: 'id1' },
                { applicationId: 'app1', id: 'id2' },
                { applicationId: 'app1', id: 'id3' },
                { applicationId: 'app1', id: 'id4' },
            ],
        })

        const [firstNode, secondNode, ...otherNodes] = await new EmrServerlessApplicationNode(
            {} as EmrServerlessNode,
            emrsClient,
            { id: 'app1' } as EmrApplication
        ).getChildren()

        assert.strictEqual((firstNode as EmrServerlessJobNode).jobRun.applicationId, 'app1')
        assert.strictEqual((secondNode as EmrServerlessJobNode).jobRun.applicationId, 'app1')
        assert.strictEqual((firstNode as EmrServerlessJobNode).jobRun.id, 'id1')
        assert.strictEqual((secondNode as EmrServerlessJobNode).jobRun.id, 'id2')
        assert.strictEqual(otherNodes.length, 2)
    })

    it('can start and stop an application', async () => {
        sandbox.stub(emrserverless, 'startApplication').callsFake(async function () {
            return
        })
        sandbox.stub(emrserverless, 'stopApplication').callsFake(async function () {
            return
        })
        sandbox.stub(emrserverless, 'waitForApplicationState').callsFake(async function () {
            return
        })
        const listApplicationsStub = sinon.stub(emrserverless, 'listApplications')
        listApplicationsStub
            .onCall(0)
            .returns(asyncGenerator([{ id: 'app1', state: 'STARTED' } as EMRServerless.ApplicationSummary]))
        listApplicationsStub
            .onCall(1)
            .returns(asyncGenerator([{ id: 'app1', state: 'STOPPED' } as EMRServerless.ApplicationSummary]))

        const parent = new EmrServerlessNode(emrserverless)

        const node = new EmrServerlessApplicationNode(parent, emrserverless, {
            state: 'STOPPED',
        } as EmrApplication)

        await node.startApplication()
        let nodes = await parent.getChildren()
        assert.match(`${nodes[0].label}`, /.*\[STARTED\].*/)

        await node.stopApplication()
        nodes = await parent.getChildren()
        assert.match(`${nodes[0].label}`, /.*\[STOPPED\].*/)
    })
})
