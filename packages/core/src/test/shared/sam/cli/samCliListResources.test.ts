/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { runSamCliListResource, SamCliListResourcesParameters } from '../../../../shared/sam/cli/samCliListResources'
import { assertArgIsPresent, assertArgsContainArgument, MockSamCliProcessInvoker } from './samCliTestUtils'
import { getTestLogger } from '../../../globalSetup.test'
import * as featureRegistry from '../../../../shared/sam/cli/samCliFeatureRegistry'

describe('runSamCliListResource', function () {
    let invokeCount: number
    let sandbox: sinon.SinonSandbox
    let validateSamCliVersionForTemplateFileStub: sinon.SinonStub
    let showWarningStub: sinon.SinonStub
    const fakeTemplateFile = 'template.yaml'
    const fakeStackName = 'testStack'
    const fakeRegion = 'us-west-2'
    const fakeProjectRoot = { fsPath: '/project/root' } as any

    beforeEach(function () {
        invokeCount = 0
        sandbox = sinon.createSandbox()
        validateSamCliVersionForTemplateFileStub = sandbox
            .stub(featureRegistry, 'validateSamCliVersionForTemplateFile')
            .resolves()
        showWarningStub = sandbox.stub(featureRegistry, 'showWarningWithSamCliUpdateInstruction').resolves()
    })

    afterEach(function () {
        sandbox.restore()
    })

    function makeSampleParameters(region?: string): SamCliListResourcesParameters {
        return {
            templateFile: fakeTemplateFile,
            stackName: fakeStackName,
            region: region,
            projectRoot: fakeProjectRoot,
        }
    }

    it('includes template file, stack name, and JSON output format', async function () {
        const invoker = new MockSamCliProcessInvoker((args) => {
            invokeCount++
            assertArgsContainArgument(args, '--template-file', fakeTemplateFile)
            assertArgsContainArgument(args, '--stack-name', fakeStackName)
            assertArgsContainArgument(args, '--output', 'json')
        })

        await runSamCliListResource(makeSampleParameters(), invoker)

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('includes the region argument if provided', async function () {
        const invoker = new MockSamCliProcessInvoker((args) => {
            invokeCount++
            assertArgIsPresent(args, '--region')
            assertArgsContainArgument(args, '--region', fakeRegion)
        })

        await runSamCliListResource(makeSampleParameters(fakeRegion), invoker)

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('does not include region argument if not provided', async function () {
        const invoker = new MockSamCliProcessInvoker((args) => {
            invokeCount++
            assert.strictEqual(args.includes('--region'), false, 'Region argument should not be present')
        })

        await runSamCliListResource(makeSampleParameters(), invoker)

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('logs message on CFN error', async function () {
        const message = 'Resource does not exist on Cloudformation'
        const invoker = new MockSamCliProcessInvoker(() => {
            throw new Error(message)
        })
        const logger = getTestLogger()

        await runSamCliListResource(makeSampleParameters(), invoker)

        const logs = logger.getLoggedEntries()
        assert.ok(logs.find((entry) => entry === message))
    })

    it('validates template before invoking SAM CLI', async function () {
        const invoker = new MockSamCliProcessInvoker(() => {})

        await runSamCliListResource(makeSampleParameters(), invoker)

        assert.ok(
            validateSamCliVersionForTemplateFileStub.calledOnce,
            'validateSamCliVersionForTemplateFile should be called once'
        )
    })

    it('returns empty array when validation fails', async function () {
        const validationError = new Error('SAM CLI version too old')
        validateSamCliVersionForTemplateFileStub.rejects(validationError)
        const invoker = new MockSamCliProcessInvoker(() => {
            invokeCount++
        })

        const result = await runSamCliListResource(makeSampleParameters(), invoker)

        assert.strictEqual(invokeCount, 0, 'SAM CLI should not be invoked when validation fails')
        assert.deepStrictEqual(result, [], 'Should return empty array on validation failure')
        assert.ok(showWarningStub.calledOnce, 'Should show warning message')
    })

    it('shows user-friendly error message when validation fails', async function () {
        const validationError = new Error('Your SAM CLI version does not support feature X')
        validateSamCliVersionForTemplateFileStub.rejects(validationError)
        const invoker = new MockSamCliProcessInvoker(() => {})

        await runSamCliListResource(makeSampleParameters(), invoker)

        assert.ok(showWarningStub.calledOnce)
        const errorMessage = showWarningStub.firstCall.args[0]
        assert.ok(errorMessage.includes('Failed to run SAM CLI list resources'))
        assert.ok(errorMessage.includes(validationError.message))
    })
})
