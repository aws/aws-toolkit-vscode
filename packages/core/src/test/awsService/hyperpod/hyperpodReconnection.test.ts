/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert from 'assert'
import { promises as fsPromises } from 'fs' // eslint-disable-line no-restricted-imports
import { HyperpodReconnectionManager } from '../../../awsService/sagemaker/hyperpodReconnection'

describe('HyperpodReconnectionManager', function () {
    const DEVSPACE_NAME = 'test-space'
    const SERVER_INFO = JSON.stringify({ port: 8080 })

    const createSuccessResponse = () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ status: 'success' }),
    })

    let sandbox: sinon.SinonSandbox
    let manager: HyperpodReconnectionManager
    let fetchStub: sinon.SinonStub
    let readStub: sinon.SinonStub
    let clock: sinon.SinonFakeTimers

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        clock = sandbox.useFakeTimers()
        manager = HyperpodReconnectionManager.getInstance()
        fetchStub = sandbox.stub(globalThis as any, 'fetch')
        readStub = sandbox.stub(fsPromises, 'readFile')
        manager.clearReconnection(DEVSPACE_NAME)
    })

    afterEach(function () {
        sandbox.restore()
        manager.clearReconnection(DEVSPACE_NAME)
    })

    it('returns singleton instance', function () {
        assert.strictEqual(
            HyperpodReconnectionManager.getInstance(),
            HyperpodReconnectionManager.getInstance(),
            'expected singleton instance to be reused'
        )
    })

    describe('scheduleReconnection', function () {
        beforeEach(function () {
            readStub.resolves(SERVER_INFO)
            fetchStub.resolves(createSuccessResponse())
        })

        it('schedules with default 15-minute interval', async function () {
            const intervalSpy = sandbox.spy(clock, 'setInterval')

            await manager.scheduleReconnection(DEVSPACE_NAME)

            sinon.assert.calledOnce(intervalSpy)
            assert.strictEqual(intervalSpy.firstCall.args[1], 15 * 60 * 1000)
        })

        it('schedules with custom interval', async function () {
            await manager.scheduleReconnection(DEVSPACE_NAME, 0.01)

            await clock.tickAsync(600)

            sinon.assert.calledOnce(fetchStub)
        })

        it('clears existing timer before scheduling new one', async function () {
            const clearIntervalSpy = sandbox.spy(clock, 'clearInterval')

            await manager.scheduleReconnection(DEVSPACE_NAME, 0.02)
            await manager.scheduleReconnection(DEVSPACE_NAME, 0.01)

            sinon.assert.calledOnce(clearIntervalSpy)

            await clock.tickAsync(1200)
            sinon.assert.callCount(fetchStub, 2)
        })
    })

    describe('clearReconnection', function () {
        it('prevents scheduled calls', async function () {
            readStub.resolves(SERVER_INFO)
            fetchStub.resolves(createSuccessResponse())

            await manager.scheduleReconnection(DEVSPACE_NAME, 0.005)
            manager.clearReconnection(DEVSPACE_NAME)

            await clock.tickAsync(1000)

            sinon.assert.notCalled(fetchStub)
        })

        it('handles non-existent timer gracefully', function () {
            assert.doesNotThrow(() => manager.clearReconnection('unknown'))
        })
    })

    describe('refreshCredentials', function () {
        it('successfully refreshes credentials', async function () {
            readStub.resolves(SERVER_INFO)
            fetchStub.resolves(createSuccessResponse())

            await manager.refreshCredentials(DEVSPACE_NAME)

            sinon.assert.calledOnce(readStub)
            sinon.assert.calledOnceWithExactly(
                fetchStub,
                'http://localhost:8080/get_hyperpod_session?connection_key=test-space'
            )
        })

        it('throws on file read error', async function () {
            readStub.rejects(new Error('File not found'))

            await assert.rejects(manager.refreshCredentials(DEVSPACE_NAME), /File not found/)
        })

        it('throws on API failure', async function () {
            readStub.resolves(SERVER_INFO)
            fetchStub.resolves({ ok: false, status: 500, statusText: 'Server Error' } as any)

            await assert.rejects(manager.refreshCredentials(DEVSPACE_NAME), /API call failed: 500/)
        })

        it('throws on API error response', async function () {
            readStub.resolves(SERVER_INFO)
            fetchStub.resolves({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({ status: 'error', message: 'Auth failed' }),
            } as any)

            await assert.rejects(manager.refreshCredentials(DEVSPACE_NAME), /Auth failed/)
        })

        it('throws on malformed JSON', async function () {
            readStub.resolves('invalid json')

            await assert.rejects(manager.refreshCredentials(DEVSPACE_NAME), /Unexpected token/)
        })
    })
})
