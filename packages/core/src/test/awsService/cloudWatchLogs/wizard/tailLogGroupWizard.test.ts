/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as sinon from 'sinon'

import assert from 'assert'
import { buildLogGroupArn, TailLogGroupWizard } from '../../../../awsService/cloudWatchLogs/wizard/tailLogGroupWizard'
import { createWizardTester } from '../../../shared/wizards/wizardTestUtils'
import { DefaultAwsContext } from '../../../../shared'

describe('TailLogGroupWizard', async function () {
    let sandbox: sinon.SinonSandbox

    const testLogGroupName = 'testLogGroup'
    const testRegion = 'testRegion'
    const testAwsAccountId = '1234'

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('prompts regionLogGroup submenu first if context not provided', async function () {
        const wizard = new TailLogGroupWizard()
        const tester = await createWizardTester(wizard)
        tester.regionLogGroupSubmenuResponse.assertShowFirst()
        tester.logStreamFilter.assertShowSecond()
        tester.filterPattern.assertShowThird()
    })

    it('skips regionLogGroup submenu if context provided', async function () {
        sandbox.stub(DefaultAwsContext.prototype, 'getCredentialAccountId').returns(testAwsAccountId)
        const wizard = new TailLogGroupWizard({
            groupName: testLogGroupName,
            regionName: testRegion,
        })
        const tester = await createWizardTester(wizard)
        tester.regionLogGroupSubmenuResponse.assertDoesNotShow()
        tester.logStreamFilter.assertShowFirst()
        tester.filterPattern.assertShowSecond()
    })

    it('skips logStream filter when logStream info is provided', async function () {
        sandbox.stub(DefaultAwsContext.prototype, 'getCredentialAccountId').returns(testAwsAccountId)
        const wizard = new TailLogGroupWizard(
            {
                groupName: testLogGroupName,
                regionName: testRegion,
            },
            { type: 'specific', filter: 'log-group-name' }
        )
        const tester = await createWizardTester(wizard)
        tester.regionLogGroupSubmenuResponse.assertDoesNotShow()
        tester.logStreamFilter.assertDoesNotShow()
        tester.filterPattern.assertShowFirst()
    })

    it('builds LogGroup Arn properly', async function () {
        sandbox.stub(DefaultAwsContext.prototype, 'getCredentialAccountId').returns(testAwsAccountId)
        const arn = buildLogGroupArn(testLogGroupName, testRegion)
        assert.strictEqual(arn, `arn:aws:logs:${testRegion}:${testAwsAccountId}:log-group:${testLogGroupName}`)
    })
})
