/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IAM } from 'aws-sdk'
import * as assert from 'assert'
import * as sinon from 'sinon'
import { DefaultIamClient, IamClient } from '../../../shared/clients/iamClient'

describe('iamClient', function () {
    describe('hasRolePermissions', async function () {
        let sandbox: sinon.SinonSandbox
        const iamClient: IamClient = new DefaultIamClient('us-west-2')
        const request: IAM.SimulatePrincipalPolicyRequest = {
            PolicySourceArn: 'taskRoleArn1234',
            ActionNames: ['example:permission'],
        }
        const correctPermissionsResponse = {
            EvaluationResults: [{ EvalDecision: 'allowed' }],
        } as IAM.SimulatePolicyResponse
        const incorrectPermissionsResponse = {
            EvaluationResults: [{ EvalDecision: 'denied' }],
        } as IAM.SimulatePolicyResponse

        beforeEach(function () {
            sandbox = sinon.createSandbox()
        })

        afterEach(function () {
            sandbox.restore()
        })
        it('verifies correct task permissions', async function () {
            sandbox.stub(iamClient, 'simulatePrincipalPolicy').resolves(incorrectPermissionsResponse)
            assert.strictEqual(await iamClient.hasRolePermissions(request), false)
        })
        it('denies incorrect task permissions', async function () {
            sandbox.stub(iamClient, 'simulatePrincipalPolicy').resolves(correctPermissionsResponse)
            assert.strictEqual(await iamClient.hasRolePermissions(request), true)
        })
        it('catches errors during permissions check', async function () {
            sandbox.stub(iamClient, 'simulatePrincipalPolicy').throws()
            assert.strictEqual(await iamClient.hasRolePermissions(request), undefined)
        })
    })
})
