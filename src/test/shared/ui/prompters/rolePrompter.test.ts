/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as assert from 'assert'
import { IAM } from 'aws-sdk'
import { IamClient } from '../../../../shared/clients/iamClient'
import { RolePrompter } from '../../../../shared/ui/common/rolePrompter'
import { mock, when } from 'ts-mockito'
import { createQuickPickTester, QuickPickTester } from '../testUtils'
import { instance } from '../../../utilities/mockito'
import { QuickPickPrompter } from '../../../../shared/ui/pickerPrompter'

const TEST_HELP_URI = vscode.Uri.parse('https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html')

describe('RolePrompter', function () {
    let sandbox: sinon.SinonSandbox
    let roles: IAM.Role[]
    let newRole: IAM.Role
    let mockIamClient: IamClient
    let tester: QuickPickTester<IAM.Role>

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        roles = [
            {
                RoleName: 'test-role1',
                Arn: 'test-arn1',
            } as any,
        ]

        newRole = {
            RoleName: 'new-role',
            Arn: 'new-arn',
        } as any

        mockIamClient = mock()
        when(mockIamClient.listRoles()).thenResolve(roles)
        const prompter = new RolePrompter(instance(mockIamClient), {
            createRole: () => Promise.resolve(newRole),
            helpUri: TEST_HELP_URI,
        }).call({ estimator: () => 0, stepCache: {} }) as QuickPickPrompter<IAM.Role>
        tester = createQuickPickTester(prompter)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('prompts for role', async function () {
        tester.acceptItem('test-role1')
        await tester.result(roles[0])
    })

    it('can refresh', async function () {
        const role2 = { RoleName: 'test-role2', Arn: 'test-arn2' } as any
        tester.addCallback(() => roles.push(role2))
        tester.pressButton('Refresh')
        tester.assertItems(['test-role1', 'test-role2'])
        tester.acceptItem('test-role2')
        await tester.result(role2)
    })

    it('can create a new role', async function () {
        tester.pressButton('Create Role...')
        tester.assertItems(['test-role1', 'new-role'])
        tester.acceptItem('new-role')
        await tester.result(newRole)
    })

    it('can open documentation', async function () {
        const openStub = sandbox.stub(vscode.env, 'openExternal')
        tester.pressButton('View Toolkit Documentation')
        tester.addCallback(() => assert.ok(openStub.calledWith(TEST_HELP_URI)))
        tester.hide()
        await tester.result()
    })
})
