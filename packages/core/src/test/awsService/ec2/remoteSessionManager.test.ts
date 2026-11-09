/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { Ec2SessionTracker } from '../../../awsService/ec2/remoteSessionManager'
import { SsmClient } from '../../../shared/clients/ssm'

describe('Ec2RemoteSessionManager', async function () {
    it('maintains connections to instances', async function () {
        const envManager = new Ec2SessionTracker('test-region', new SsmClient('test-region'))
        await envManager.addSession('test-instance', 'test-env')
        await envManager.addSession('test-instance2', 'test-env2')
        await envManager.addSession('test-instance3', 'test-env3')

        assert(envManager.isConnectedTo('test-instance'))
        assert(envManager.isConnectedTo('test-instance2'))
        assert(envManager.isConnectedTo('test-instance3'))
        assert(!envManager.isConnectedTo('test-instance4'))
    })

    it('only allows for single connection with any given instance', async function () {
        const envManager = new Ec2SessionTracker('test-region', new SsmClient('test-region'))
        const terminateStub = sinon.stub(SsmClient.prototype, 'terminateSessionFromId')

        await envManager.addSession('test-instance', 'test-env')
        sinon.assert.notCalled(terminateStub)
        await envManager.addSession('test-instance', 'test-env2')

        sinon.assert.calledWith(terminateStub, 'test-env')

        assert(envManager.isConnectedTo('test-instance'))

        terminateStub.restore()
    })

    it('closes all active connections', async function () {
        const envManager = new Ec2SessionTracker('test-region', new SsmClient('test-region'))
        const terminateStub = sinon.stub(SsmClient.prototype, 'terminateSessionFromId')

        await envManager.addSession('test-instance', 'test-env')
        await envManager.addSession('test-instance2', 'test-env2')
        await envManager.addSession('test-instance3', 'test-env3')

        await envManager.dispose()

        sinon.assert.calledThrice(terminateStub)
        assert(!envManager.isConnectedTo('test-instance'))
        assert(!envManager.isConnectedTo('test-instance2'))
        assert(!envManager.isConnectedTo('test-instance3'))

        terminateStub.restore()
    })
})
