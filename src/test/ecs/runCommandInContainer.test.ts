/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IAM } from 'aws-sdk'
import * as assert from 'assert'
import * as sinon from 'sinon'
import globals from '../../shared/extensionGlobals'
import { IamClient } from '../../shared/clients/iamClient'
import { isMissingRequiredPermissions } from '../../ecs/commands/runCommandInContainer'
import { MockIamClient } from '../shared/clients/mockClients'

describe('runCommandInContainer', async function () {
    let sandbox: sinon.SinonSandbox
    const iamClient: IamClient = new MockIamClient()
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
        sandbox.stub(globals.toolkitClientBuilder, 'createIamClient').returns(iamClient)
        sandbox.stub(iamClient, 'simulatePrincipalPolicy').resolves(correctPermissionsResponse)
        assert.strictEqual(await isMissingRequiredPermissions('taskRoleArn1234', 'region'), true)
    })
    it('denies incorrect task permissions', async function () {
        sandbox.stub(globals.toolkitClientBuilder, 'createIamClient').returns(iamClient)
        sandbox.stub(iamClient, 'simulatePrincipalPolicy').resolves(incorrectPermissionsResponse)
        assert.strictEqual(await isMissingRequiredPermissions('taskRoleArn1234', 'region'), false)
    })
})
