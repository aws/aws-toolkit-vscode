/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// import sinon = require('sinon')
import { EmrServerlessNode } from '../../../emr-serverless/explorer/emrServerlessNode'
import { EmrServerlessClient } from '../../../shared/clients/emrServerlessClient'
import EMRServerless = require('aws-sdk/clients/emrserverless')
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'
import assert = require('assert')
import { stub } from '../../utilities/stubber'
import globals from '../../../shared/extensionGlobals'
import { assertNodeListOnlyHasPlaceholderNode } from '../../utilities/explorerNodeAssertions'

const regionCode = 'someregioncode'

interface ApplicationDetails {
    id: string
    state?: EMRServerless.ApplicationState
}

interface JobDetails {
    applicationId: string
    id: string
}

const appDefault = {
    id: 'testId',
    name: 'testName',
    arn: `arn:aws:emr-serverless:${regionCode}:123412341234:/applications:`,
    state: 'STOPPED',
    releaseLabel: 'emr-6.13.0',
    type: 'SPARK',
    createdAt: new globals.clock.Date(),
    updatedAt: new globals.clock.Date(),
}

const jobDefault = {
    applicationId: appDefault.id,
    id: 'testJobId',
    arn: `arn:aws:emr-serverless:${regionCode}:123412341234:/applications/${appDefault.id}/jobruns/`,
    createdBy: `arn:aws:emr-serverless:${regionCode}:123412341234:user/userName`,
    createdAt: new globals.clock.Date(),
    updatedAt: new globals.clock.Date(),
    executionRole: `arn:aws:emr-serverless:${regionCode}:123412341234:role/emrServerlessRole`,
    state: 'SUCCESS',
    stateDetails: '',
    releaseLabel: 'emr-6.13.0',
}

export function createEmrServerlessClient(data?: {
    apps?: ApplicationDetails[]
    jobs?: JobDetails[]
}): EmrServerlessClient {
    const client = stub(EmrServerlessClient, { regionCode })
    client.listApplications.returns(
        asyncGenerator<EMRServerless.ApplicationSummary>(
            (data?.apps ?? [])
                .map(detail => {
                    return {
                        ...appDefault,
                        ...detail,
                    }
                })
                .map(j => {
                    j.arn = `${j.arn}${j.id}`
                    return j
                })
        )
    )
    client.listJobRuns.returns(
        asyncGenerator<EMRServerless.JobRunSummary>(
            (data?.jobs ?? [])
                .map(detail => {
                    return {
                        ...jobDefault,
                        ...detail,
                    }
                })
                .map(j => {
                    j.arn = `arn:aws:emr-serverless:${regionCode}:123412341234:/applications/${j.applicationId}/jobruns/${j.id}`
                    return j
                })
        )
    )
    return client
}

describe('emrServerlessNode', function () {
    describe('getChildren', function () {
        let node: EmrServerlessNode

        it('returns placeholder node if no children are present', async function () {
            const client = createEmrServerlessClient()
            node = new EmrServerlessNode(client)
            assertNodeListOnlyHasPlaceholderNode(await node.getChildren())
        })

        it('loads applications succesfully', async () => {
            const client = createEmrServerlessClient({ apps: [{ id: 'testId1' }, { id: 'testId2', state: 'STARTED' }] })
            node = new EmrServerlessNode(client)

            const children = await node.getChildren()
            assert.strictEqual(children.length, 2)
        })

        it('lists application status properly', async () => {
            const client = createEmrServerlessClient({ apps: [{ id: 'testId1' }, { id: 'testId2', state: 'STARTED' }] })
            node = new EmrServerlessNode(client)
            const children = await node.getChildren()

            assert.match(children[0].label!.toString(), /.*STOPPED.*/)
            assert.match(children[1].label!.toString(), /.*STARTED.*/)
        })
    })
})
