/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { stub } from '../utilities/stubber'
import { checkPermissionsForSsm } from '../../ecs/util'
import { DefaultIamClient } from '../../shared/clients/iamClient'

describe('checkPermissionsForSsm', function () {
    const getClient = () => stub(DefaultIamClient, { regionCode: '' })

    it('rejects task definitions without a role', async function () {
        await assert.rejects(() => checkPermissionsForSsm(getClient(), {}), /must have a task role/i)
    })

    it('rejects roles if any permissions are rejected', async function () {
        const client = getClient()
        client.getDeniedActions.resolves([{ EvalActionName: 'foo', EvalDecision: 'explicitDeny' }])
        await assert.rejects(() => checkPermissionsForSsm(client, { taskRoleArn: 'bar' }), /insufficient permissions/i)
    })

    it('returns successfully if no permissions are rejected', async function () {
        const client = getClient()
        client.getDeniedActions.resolves([])
        await checkPermissionsForSsm(client, { taskRoleArn: 'bar' })
    })
})
