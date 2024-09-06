/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import { IAM } from 'aws-sdk'
import { DefaultIamClient } from '../../../../shared/clients/iamClient'
import { createQuickPickPrompterTester, QuickPickPrompterTester } from '../testUtils'
import { createRolePrompter } from '../../../../shared/ui/common/roles'
import { toCollection } from '../../../../shared/utilities/asyncCollection'
import { stub } from '../../../utilities/stubber'
import { getOpenExternalStub } from '../../../globalSetup.test'

const helpUri = vscode.Uri.parse('https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html')

describe('createRolePrompter', function () {
    let roles: IAM.Role[]
    let newRole: IAM.Role
    let tester: QuickPickPrompterTester<IAM.Role>

    beforeEach(function () {
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

        const client = stub(DefaultIamClient, { regionCode: 'region-1' })
        client.getRoles.returns(
            toCollection(async function* () {
                yield roles
            })
        )

        const prompter = createRolePrompter(client, {
            createRole: () => Promise.resolve(newRole),
            helpUrl: helpUri,
        })

        tester = createQuickPickPrompterTester(prompter)
    })

    afterEach(function () {
        sinon.restore()
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
        getOpenExternalStub().resolves(true)
        tester.pressButton('View Toolkit Documentation')
        tester.addCallback(() => assert.ok(getOpenExternalStub().calledWith(helpUri)))
        tester.hide()
        await tester.result()
    })
})
