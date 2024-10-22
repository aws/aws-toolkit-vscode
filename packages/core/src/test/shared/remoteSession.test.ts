/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { minimumSsmActions, promptToAddInlinePolicy } from '../../shared/remoteSession'
import { IamClient } from '../../shared/clients/iamClient'
import { getTestWindow } from './vscode/window'
import { cancel } from '../../shared'

describe('minimumSsmActions', function () {
    it('should contain minimal actions needed for ssm connection', function () {
        assert.deepStrictEqual(minimumSsmActions, [
            'ssmmessages:CreateControlChannel',
            'ssmmessages:CreateDataChannel',
            'ssmmessages:OpenControlChannel',
            'ssmmessages:OpenDataChannel',
            'ssm:DescribeAssociation',
            'ssm:ListAssociations',
            'ssm:UpdateInstanceInformation',
        ])
    })

    it('prompts the user for confirmation before adding policies and allow cancels', async function () {
        getTestWindow().onDidShowMessage((message) => {
            assert.ok(message.message.includes('add'), 'should prompt to add policies')
            getTestWindow().getFirstMessage().selectItem(cancel)
        })
        const added = await promptToAddInlinePolicy({} as IamClient, 'roleArnTest')
        assert.ok(!added, 'should not add policies by default')
    })
})
