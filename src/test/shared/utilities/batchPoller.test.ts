/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as FakeTimers from '@sinonjs/fake-timers'
import { BatchPoller, PollEvent, PollListener, BatchPollerOptions } from '../../../shared/utilities/batchPoller'
import * as assert from 'assert'

type TestModel = string

const TRANSIENT = 'pending'
const STEADY = 'not pending'

describe('BatchPoller', function () {
    const TEST_OPTIONS: Required<BatchPollerOptions> = {
        name: 'test poller',
        baseTime: 5000,
        jitter: 0,
        logging: false,
    }

    let clock: FakeTimers.InstalledClock
    let poller: BatchPoller<TestModel>
    let pollEvents: PollEvent<TestModel>[]

    let testInput: TestModel
    let listener: PollListener<TestModel>
    let updatedModel: TestModel | undefined
    let testEvent: PollEvent<TestModel>

    before(function () {
        clock = FakeTimers.install()
    })

    after(function () {
        clock.uninstall()
    })

    beforeEach(function () {
        clock.reset()
        poller = new BatchPoller(listpollEvents, TEST_OPTIONS)
        pollEvents = []
        resetFirstEvent()
    })

    function resetFirstEvent(): void {
        testInput = STEADY
        testEvent = { id: 0, model: testInput }
        updatedModel = undefined
        listener = createListener(testEvent.id, model => (updatedModel = model))
    }

    async function listpollEvents(): Promise<PollEvent<TestModel>[]> {
        const events = [...pollEvents]
        pollEvents = []
        return events
    }

    function createListener(id: number | string, update: (model: TestModel) => void): PollListener<TestModel> {
        return { id, update, isPending: model => model === TRANSIENT }
    }

    function registerEvent(event: PollEvent<TestModel>, updateTime: number = 0): void {
        if (updateTime === 0) {
            pollEvents.push(event)
        } else {
            setTimeout(() => pollEvents.push(event), updateTime)
        }
    }

    it(`requests events after ${TEST_OPTIONS.baseTime} (base time) milliseconds`, async function () {
        registerEvent(testEvent)
        poller.addPollListener(listener)

        await clock.tickAsync(TEST_OPTIONS.baseTime)
        assert.strictEqual(updatedModel, testInput)
    })

    it(`waits for longer periods of time after each collision`, async function () {
        poller.addPollListener(listener)

        registerEvent({ id: 0, model: TRANSIENT }, TEST_OPTIONS.baseTime)
        registerEvent({ id: 0, model: STEADY }, TEST_OPTIONS.baseTime * 10)

        await clock.tickAsync(TEST_OPTIONS.baseTime)
        assert.strictEqual(updatedModel, undefined)
        assert.strictEqual(pollEvents.length, 1)

        await clock.tickAsync(TEST_OPTIONS.baseTime * 2)
        assert.strictEqual(updatedModel, undefined)
        assert.strictEqual(pollEvents.length, 0)

        await clock.tickAsync(TEST_OPTIONS.baseTime * 20)
        assert.strictEqual(updatedModel, testInput)
    })

    it(`requests more events if listeners are still waiting`, async function () {
        const firstEvent: PollEvent<TestModel> = { id: 0, model: TRANSIENT }
        const secondEvent: PollEvent<TestModel> = { id: 0, model: STEADY }

        pollEvents.push(firstEvent)
        poller.addPollListener(createListener(firstEvent.id, model => (updatedModel = model)))

        await clock.tickAsync(TEST_OPTIONS.baseTime)
        pollEvents.push(secondEvent)

        await clock.tickAsync(TEST_OPTIONS.baseTime)
        assert.strictEqual(updatedModel, undefined)

        await clock.tickAsync(TEST_OPTIONS.baseTime)
        assert.strictEqual(updatedModel, secondEvent.model)
    })

    it(`handles multiple listeners`, async function () {
        let updatedModel1: TestModel | undefined
        let updatedModel2: TestModel | undefined
        const finalEvent1 = { id: 0, model: STEADY }
        const finalEvent2 = { id: 1, model: STEADY }

        registerEvent({ id: 0, model: TRANSIENT })
        registerEvent({ id: 1, model: TRANSIENT })
        registerEvent(finalEvent1, TEST_OPTIONS.baseTime)
        registerEvent({ id: 1, model: TRANSIENT }, TEST_OPTIONS.baseTime)
        registerEvent(finalEvent2, TEST_OPTIONS.baseTime * 4)

        poller.addPollListener(createListener(finalEvent1.id, model => (updatedModel1 = model)))
        poller.addPollListener(createListener(finalEvent2.id, model => (updatedModel2 = model)))

        await clock.tickAsync(TEST_OPTIONS.baseTime)
        assert.strictEqual(updatedModel1, undefined)

        await clock.tickAsync(TEST_OPTIONS.baseTime * 2)
        assert.strictEqual(updatedModel1, finalEvent1.model)
        assert.strictEqual(updatedModel2, undefined)

        await clock.tickAsync(TEST_OPTIONS.baseTime * 2)
        assert.strictEqual(updatedModel2, finalEvent2.model)
    })

    it(`pushes the timeout to at least the base time when adding a new listener`, async function () {
        let updatedModel1: TestModel | undefined
        let updatedModel2: TestModel | undefined
        const finalEvent1 = { id: 0, model: STEADY }
        const finalEvent2 = { id: 1, model: STEADY }
        registerEvent(finalEvent1)
        registerEvent(finalEvent2, TEST_OPTIONS.baseTime)

        poller.addPollListener(createListener(finalEvent1.id, model => (updatedModel1 = model)))

        await clock.tickAsync(TEST_OPTIONS.baseTime / 2)
        assert.strictEqual(updatedModel1, undefined)
        assert.strictEqual(updatedModel2, undefined)

        poller.addPollListener(createListener(finalEvent2.id, model => (updatedModel2 = model)))

        await clock.tickAsync(TEST_OPTIONS.baseTime / 2)
        assert.strictEqual(updatedModel1, undefined)
        assert.strictEqual(updatedModel2, undefined)

        await clock.tickAsync(TEST_OPTIONS.baseTime)
        assert.strictEqual(updatedModel1, finalEvent1.model)
        assert.strictEqual(updatedModel2, finalEvent2.model)
    })

    describe(`remove listeners`, function () {
        async function checkRemoveListener(listener: Parameters<BatchPoller['removePollListener']>[0]): Promise<void> {
            await clock.tickAsync(TEST_OPTIONS.baseTime / 2)
            poller.removePollListener(listener)
            await clock.tickAsync(TEST_OPTIONS.baseTime / 2)
            assert.strictEqual(updatedModel, undefined)
        }

        it('can remove listener directly', async function () {
            registerEvent(testEvent)
            poller.addPollListener(listener)

            await checkRemoveListener(listener)
        })

        it('can remove listener by id', async function () {
            registerEvent(testEvent)
            poller.addPollListener(listener)

            await checkRemoveListener(listener.id)
        })

        it('regenerates timer when removing a listener', async function () {
            let otherModel: TestModel | undefined
            const otherEvent: PollEvent<TestModel> = { id: 1, model: TRANSIENT, retryAfter: TEST_OPTIONS.baseTime * 5 }
            const otherListener = createListener(otherEvent.id, model => (otherModel = model))

            registerEvent(testEvent)
            registerEvent(otherEvent)
            registerEvent({ id: 1, model: STEADY }, TEST_OPTIONS.baseTime * 4)

            poller.addPollListener(listener)
            poller.addPollListener(otherListener)

            await clock.tickAsync((TEST_OPTIONS.baseTime * 3) / 2)

            resetFirstEvent()
            poller.addPollListener(listener)

            await clock.tickAsync(TEST_OPTIONS.baseTime / 2)
            await checkRemoveListener(listener)
            await clock.tickAsync((TEST_OPTIONS.baseTime * 3) / 2)

            assert.strictEqual(otherModel, undefined)
        })
    })
})
