/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert from 'assert'
import { HyperpodConnectionMonitor } from '../../../awsService/sagemaker/hyperpodConnectionMonitor'
import { HyperpodReconnectionManager } from '../../../awsService/sagemaker/hyperpodReconnection'

describe('HyperpodConnectionMonitor', function () {
    let sandbox: sinon.SinonSandbox
    let clock: sinon.SinonFakeTimers
    let monitor: HyperpodConnectionMonitor

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        clock = sandbox.useFakeTimers()
        monitor = createMonitor()
    })

    afterEach(function () {
        monitor.dispose()
        clock.restore()
        sandbox.restore()
    })

    it('refreshes credentials immediately after a disconnection is detected', async function () {
        const reconnectStub = sandbox.stub().resolves()
        sandbox.stub(HyperpodReconnectionManager, 'getInstance').returns({
            reconnectToHyperpod: reconnectStub,
        } as any)

        monitor.startMonitoring('hp-devspace')

        await (monitor as any).handleDisconnection('hp-devspace', 'process_exit')

        assert.strictEqual(reconnectStub.calledOnce, true)
        assert.ok(
            reconnectStub.calledWithExactly('hp-devspace'),
            'expected monitor to request immediate credential refresh'
        )

        const state = (monitor as any).connections.get('hp-devspace')
        assert.ok(state, 'connection state should still exist')
        assert.strictEqual(state.reconnectAttempts, 0, 'state should reset after successful refresh')
    })

    it('retries credential refresh with exponential backoff and stops at the limit', async function () {
        const reconnectStub = sandbox.stub().rejects(new Error('network down'))
        const managerStub = {
            reconnectToHyperpod: reconnectStub,
        }
        sandbox.stub(HyperpodReconnectionManager, 'getInstance').returns(managerStub as any)

        monitor.startMonitoring('hp-devspace')

        await (monitor as any).handleDisconnection('hp-devspace', 'network_lost')
        await clock.tickAsync(1000)
        await clock.tickAsync(2000)
        await clock.tickAsync(4000)

        assert.strictEqual(reconnectStub.callCount, 4, 'should attempt initial call plus three retries')
        const state = (monitor as any).connections.get('hp-devspace')
        assert.ok(state, 'connection state should still exist')
        assert.strictEqual(state.retryTimer, undefined, 'no retry timer should remain after hitting retry cap')
    })

    function createMonitor() {
        const instance = new HyperpodConnectionMonitor()
        sandbox.stub(instance as any, 'startHealthChecks').callsFake(() => {})
        sandbox.stub(instance as any, 'setupEventListeners').callsFake(() => {})
        return instance
    }
})
