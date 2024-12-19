/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import { getDeployedResources, StackResource } from '../../../lambda/commands/listSamResources'
import * as SamCliListResourcesModule from '../../../shared/sam/cli/samCliListResources'
import assert from 'assert'
import { getTestWindow } from '../../shared/vscode/window'
import { assertLogsContain } from '../../globalSetup.test'

describe('listSamResources', () => {
    const mockParams = { invoker: {}, listResourcesParams: {} }
    describe('getDeployedResources', () => {
        let sandbox: sinon.SinonSandbox
        let runSamCliListResourceStub: sinon.SinonStub

        beforeEach(() => {
            sandbox = sinon.createSandbox()
            runSamCliListResourceStub = sandbox.stub(SamCliListResourcesModule, 'runSamCliListResource')
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('returns only deployed resources given mixed resource returned from SAM api', async () => {
            runSamCliListResourceStub.resolves(JSON.stringify([...localUndeployedResources, ...deployedResources]))
            const result = await getDeployedResources(mockParams)

            assert.deepStrictEqual(result, deployedResources)
            assert(runSamCliListResourceStub.calledOnceWith(mockParams.invoker, mockParams.listResourcesParams))
        })

        it('returns empty array went given no deployed resources', async () => {
            runSamCliListResourceStub.resolves(JSON.stringify(localUndeployedResources))
            const result = await getDeployedResources(mockParams)

            assert.strictEqual(result?.length, 0)
            assert(runSamCliListResourceStub.calledOnce)
        })

        it('returns all resources went given all deployed resources', async () => {
            runSamCliListResourceStub.resolves(JSON.stringify(deployedResources))
            const result = await getDeployedResources(mockParams)

            assert.deepStrictEqual(result, deployedResources)
            assert(runSamCliListResourceStub.calledOnce)
        })

        it('return undefined given an unlikely error when calling SAM api', async () => {
            runSamCliListResourceStub.rejects(new Error('Unlikely error'))
            const result = await getDeployedResources(mockParams)

            assert(!result)
            assert(runSamCliListResourceStub.calledOnce)
            assertLogsContain('Unlikely error', true, 'error')
        })

        const testcases = [
            { name: 'stringify array', value: '[]' },
            { name: 'array object', value: [] },
        ]
        testcases.forEach(async ({ name, value }) => {
            it(`returns empty array given SAM CLI return ${name} given any issue`, async () => {
                runSamCliListResourceStub.resolves(value)

                const result = await getDeployedResources(mockParams)

                assert.strictEqual(result?.length, 0)
                assert(runSamCliListResourceStub.calledOnce)
            })
        })

        it('returns empty array given issue parsing SAM CLI result', async () => {
            runSamCliListResourceStub.resolves("[{'key':, 'wihtout':, 'value' }]")

            const result = await getDeployedResources(mockParams)

            assert.strictEqual(result?.length, 0)
            getTestWindow().getFirstMessage().assertMessage(new RegExp(`Failed to parse SAM CLI output.*`))
            assert(runSamCliListResourceStub.calledOnce)
        })
    })
})

const localUndeployedResources: StackResource[] = [
    {
        LogicalResourceId: 'myUndeployedLamdaFunction',
        PhysicalResourceId: '-',
    },
    {
        LogicalResourceId: 'myOtherLocalUndeployedLamdaFunction',
        PhysicalResourceId: '-',
    },
]

const deployedResources: StackResource[] = [
    {
        LogicalResourceId: 'myLamdaFunction',
        PhysicalResourceId: 'myLamdaFunction-logical-id',
    },
    {
        LogicalResourceId: 'myLamdaOtherFunction',
        PhysicalResourceId: 'myLamdaOtherFunction-logical-id',
    },
    {
        LogicalResourceId: 'myLamdaOtherResource',
        PhysicalResourceId: 'myLamdaOtherResource-logical-id',
    },
]
