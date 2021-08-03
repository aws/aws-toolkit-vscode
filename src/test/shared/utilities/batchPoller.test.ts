/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as FakeTimers from '@sinonjs/fake-timers'
import {
    BatchPoller,
    PollEvent,
    PollListener,
    BatchPollerOptions,
    exponentialBackoff,
} from '../../../shared/utilities/batchPoller'
import * as assert from 'assert'

type TestModel = string

const TRANSIENT = 'pending'
const STEADY = 'not pending'

describe('BatchPoller', function () {
    const TEST_OPTIONS: Required<BatchPollerOptions> = {
        name: 'test poller',
        baseTime: 5000,
        jitter: 0,
        backoffFactor: 1,
        logging: false,
        // For testing we will just use the most aggressive heuristic
        // That is, always use the smallest retry after time
        heuristic: deltas => Math.min(...deltas),
    }

    const backoff = exponentialBackoff.bind(undefined, TEST_OPTIONS)

    let clock: FakeTimers.InstalledClock
    let poller: BatchPoller<TestModel>
    let pollEvents: PollEvent<TestModel>[]

    /** Returns the sum of backoff times: backoff(n) + backoff(n-1) + ... + backoff(0) */
    function cumulativeBackoff(count: number): number {
        return backoff(count) + (count > 0 ? cumulativeBackoff(count - 1) : 0)
    }

    async function listpollEvents(): Promise<PollEvent<TestModel>[]> {
        const events = [...pollEvents]
        pollEvents = []
        return events
    }

    function registerEvent(event: PollEvent<TestModel>, updateTime: number = 0): void {
        if (updateTime === 0) {
            pollEvents.push(event)
        } else {
            setTimeout(() => pollEvents.push(event), updateTime)
        }
    }

    function isTestModel(obj: any): obj is TestModel {
        return typeof obj === 'string'
    }

    /** Testing construct that encapsulates a model with a listener. */
    class Subscriber {
        private static idCounter: number = 0
        private id: number = Subscriber.idCounter++
        private model!: TestModel
        private snapshot: Map<number, TestModel> = new Map()
        public listener: PollListener<TestModel>

        public constructor(model: TestModel = TRANSIENT) {
            this.listener = {
                id: this.id,
                update: this.update.bind(this),
                isPending: model => model === TRANSIENT,
            }
            poller.addPollListener(this.listener)
            this.update(model)
        }

        private update(model: TestModel): void {
            this.model = model
            this.snapshot.set(Date.now(), model)
        }

        /**
         * Creates a new event offset from the current time.
         */
        public createEvent(event: Omit<PollEvent<TestModel>, 'id'> | TestModel, when: number = 0): void {
            if (isTestModel(event)) {
                registerEvent({ model: event, id: this.id }, Date.now() + when)
            } else {
                registerEvent({ ...event, id: this.id }, Date.now() + when)
            }
        }

        /**
         * Asserts the subscriber has the expected state at the specified time.
         *
         * If no time is provided, it uses the current state.
         */
        public assertState(expected: TestModel, when?: number): void {
            const actual = when !== undefined ? this.snapshot.get(when) : this.model
            assert.strictEqual(actual, expected)
        }

        public assertUpdatedWhen(when: number): void {
            assert.strictEqual(this.snapshot.has(when), true)
        }

        public assertNotUpdatedWhen(when: number): void {
            assert.strictEqual(this.snapshot.has(when), false)
        }

        public remove(): void {
            poller.removePollListener(this.id)
        }
    }

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
    })

    it(`starts running when adding a new listener`, function () {
        new Subscriber()
        assert.strictEqual(poller.status, 'Running')
    })

    it(`requests events after ${TEST_OPTIONS.baseTime} (base time) milliseconds`, async function () {
        const subscriber = new Subscriber()
        subscriber.createEvent(STEADY)

        await clock.tickAsync(TEST_OPTIONS.baseTime * 100)

        subscriber.assertState(STEADY)
        subscriber.assertUpdatedWhen(TEST_OPTIONS.baseTime)
    })

    it(`waits for longer periods of time after each collision`, async function () {
        const subscriber = new Subscriber()
        subscriber.createEvent(TRANSIENT, backoff(0))
        subscriber.createEvent(STEADY, cumulativeBackoff(2))

        await clock.tickAsync(cumulativeBackoff(3))

        subscriber.assertNotUpdatedWhen(backoff(0))
        subscriber.assertState(STEADY, cumulativeBackoff(2))
    })

    it(`handles multiple listeners`, async function () {
        const subscriber1 = new Subscriber()
        const subscriber2 = new Subscriber()

        subscriber1.createEvent(TRANSIENT)
        subscriber1.createEvent(STEADY, backoff(0) / 2)
        subscriber2.createEvent(TRANSIENT)
        subscriber2.createEvent(TRANSIENT, backoff(0) / 2)
        subscriber2.createEvent(STEADY, backoff(1) / 2 + backoff(0))

        await clock.tickAsync(cumulativeBackoff(1))

        subscriber1.assertUpdatedWhen(backoff(0))
        subscriber2.assertNotUpdatedWhen(backoff(0))
        subscriber2.assertUpdatedWhen(cumulativeBackoff(1))

        subscriber1.assertState(STEADY)
        subscriber2.assertState(STEADY)
    })

    it(`pushes the timeout to at least the base time when adding a new listener`, async function () {
        const offset = backoff(0) / 4
        const subscriber1 = new Subscriber()
        subscriber1.createEvent(STEADY, backoff(0))

        await clock.tickAsync(offset)

        const subscriber2 = new Subscriber()
        subscriber2.createEvent(STEADY, backoff(0))

        await clock.tickAsync(cumulativeBackoff(1))

        subscriber1.assertUpdatedWhen(backoff(0) + offset)
        subscriber2.assertUpdatedWhen(cumulativeBackoff(1) + offset)
    })

    it('can remove listener directly', async function () {
        const subscriber = new Subscriber()
        subscriber.remove()
        assert.strictEqual(poller.status, 'Stopped')
    })

    it('can remove listener by id', async function () {
        const subscriber = new Subscriber()
        poller.removePollListener(subscriber.listener)
        assert.strictEqual(poller.status, 'Stopped')
    })

    it('regenerates timer when removing a listener', async function () {
        const subscriber1 = new Subscriber()
        const subscriber2 = new Subscriber()

        subscriber1.createEvent(STEADY)
        subscriber2.createEvent(STEADY)

        await clock.tickAsync(backoff(0) / 2)
        subscriber1.remove()
        await clock.tickAsync(backoff(0))

        subscriber1.assertState(TRANSIENT)
        subscriber2.assertUpdatedWhen((backoff(0) * 3) / 2)
    })
})
