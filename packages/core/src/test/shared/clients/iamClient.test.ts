/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { IamClient } from '../../../shared/clients/iam'
import { SimulatePolicyResponse, SimulatePrincipalPolicyRequest } from '@aws-sdk/client-iam'

describe('iamClient', function () {
    describe('getDeniedActions', async function () {
        const iamClient: IamClient = new IamClient('us-west-2')
        const request: SimulatePrincipalPolicyRequest = {
            PolicySourceArn: 'taskRoleArn1234',
            ActionNames: ['example:permission'],
        }
        const correctPermissionsResponse: SimulatePolicyResponse = {
            EvaluationResults: [{ EvalActionName: 'example:permission', EvalDecision: 'allowed' }],
        }
        const incorrectPermissionsResponse: SimulatePolicyResponse = {
            EvaluationResults: [{ EvalActionName: 'example:permission', EvalDecision: 'explicitDeny' }],
        }
        const organizationsDenyPermissionsResponse: SimulatePolicyResponse = {
            EvaluationResults: [
                {
                    EvalActionName: 'example:permission',
                    EvalDecision: 'implicitDeny',
                    OrganizationsDecisionDetail: { AllowedByOrganizations: false },
                },
            ],
        }

        afterEach(function () {
            sinon.restore()
        })

        it('returns incorrect task permissions', async function () {
            sinon.stub(iamClient, 'simulatePrincipalPolicy').resolves(incorrectPermissionsResponse)
            assert.deepStrictEqual(
                await iamClient.getDeniedActions(request),
                incorrectPermissionsResponse.EvaluationResults
            )
        })

        it('does not return correct task permissions', async function () {
            sinon.stub(iamClient, 'simulatePrincipalPolicy').resolves(correctPermissionsResponse)
            assert.deepStrictEqual(await iamClient.getDeniedActions(request), [])
        })

        it('does not return possibly false organizational implicitDeny', async function () {
            sinon.stub(iamClient, 'simulatePrincipalPolicy').resolves(organizationsDenyPermissionsResponse)
            assert.deepStrictEqual(await iamClient.getDeniedActions(request), [])
        })
    })
})
