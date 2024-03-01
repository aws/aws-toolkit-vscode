/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as sinon from 'sinon'
import * as fs from 'fs-extra'
import { DefaultTelemetryService } from '../../../shared/telemetry/telemetryService'
import { AccountStatus } from '../../../shared/telemetry/telemetryClient'
import { FakeExtensionContext } from '../../fakeExtensionContext'

import {
    defaultTestAccountId,
    FakeAwsContext,
    makeFakeAwsContextWithPlaceholderIds,
} from '../../utilities/fakeAwsContext'
import { FakeTelemetryPublisher } from '../../fake/fakeTelemetryService'
import ClientTelemetry = require('../../../shared/telemetry/clienttelemetry')
import { installFakeClock } from '../../testUtil'
import { TelemetryLogger } from '../../../shared/telemetry/telemetryLogger'
import globals from '../../../shared/extensionGlobals'
import { toArrayAsync } from '../../../shared/utilities/collectionUtils'

type Metric = { [P in keyof ClientTelemetry.MetricDatum as Uncapitalize<P>]: ClientTelemetry.MetricDatum[P] }

export function fakeMetric(metric: Partial<Metric> = {}): ClientTelemetry.MetricDatum {
    return {
        Passive: metric.passive ?? true,
        MetricName: metric.metricName ?? `metric${metric.value ?? ''}`,
        Value: metric.value ?? 1,
        Unit: metric.unit ?? 'None',
        EpochTimestamp: metric.epochTimestamp ?? new globals.clock.Date().getTime(),
    }
}

describe('DefaultTelemetryService', function () {
    const testFlushPeriod = 10
    let clock: FakeTimers.InstalledClock
    let sandbox: sinon.SinonSandbox
    let mockContext: FakeExtensionContext
    let mockPublisher: FakeTelemetryPublisher
    let service: DefaultTelemetryService
    let logger: TelemetryLogger

    async function initService(awsContext = new FakeAwsContext()): Promise<DefaultTelemetryService> {
        const newService = await DefaultTelemetryService.create(mockContext, awsContext, undefined, mockPublisher)
        newService.flushPeriod = testFlushPeriod
        newService.telemetryEnabled = true

        return newService
    }

    function stubGlobal() {
        // TODO: don't record session stop/start using the global object so we don't have to do this
        sandbox.stub(globals, 'telemetry').value(service)
    }

    before(function () {
        sandbox = sinon.createSandbox()
    })

    beforeEach(async function () {
        mockContext = await FakeExtensionContext.create()
        mockPublisher = new FakeTelemetryPublisher()
        service = await initService()
        logger = service.logger
        clock = installFakeClock()
    })

    afterEach(async function () {
        await fs.remove(service.persistFilePath)
        sandbox.restore()
        clock.uninstall()
    })

    after(function () {
        clock.uninstall()
    })

    it('posts feedback', async function () {
        service.telemetryEnabled = false
        const feedback = { comment: '', sentiment: '' }
        await service.postFeedback(feedback)

        assert.strictEqual(mockPublisher.feedback, feedback)
    })

    it('assertPassiveTelemetry() throws if active, non-cached metric is emitted during startup', async function () {
        // Simulate cached telemetry by prepopulating records before start().
        // (Normally readEventsFromCache() does this.)
        service.record(fakeMetric({ value: 1, passive: true }))
        service.record(fakeMetric({ value: 2, passive: true }))
        // Active *cached* metric.
        service.record(fakeMetric({ value: 4, passive: false }))
        await service.start()

        // Passive *non-cached* metric.
        service.record(fakeMetric({ value: 5, passive: true }))

        // Must *not* throw.
        service.assertPassiveTelemetry(false)

        // Active *non-cached* metric.
        service.record(fakeMetric({ value: 6, passive: false }))

        // Must throw.
        assert.throws(() => {
            service.assertPassiveTelemetry(false)
        })

        await service.shutdown()
    })

    it('findIter() queries pending metric items', async function () {
        await service.start()
        const m1 = fakeMetric({ value: 1, passive: true })
        const m2 = fakeMetric({ value: 2, passive: true })
        const m3 = fakeMetric({ value: 4, passive: false })
        const m4 = fakeMetric({ value: 5, passive: false })
        const m5 = fakeMetric({ value: 6, passive: true })
        service.record(m1)
        service.record(m2)
        service.record(m3)
        service.record(m4)
        service.record(m5)

        assert.deepStrictEqual(
            await toArrayAsync(
                service.findIter(m => {
                    return m.MetricName === 'bogus'
                })
            ),
            []
        )
        assert.deepStrictEqual(
            await toArrayAsync(
                service.findIter(m => {
                    return m.MetricName === 'metric1'
                })
            ),
            [m1]
        )
        assert.deepStrictEqual(
            await toArrayAsync(
                service.findIter(m => {
                    return !!m.Passive
                })
            ),
            [m1, m2, m5]
        )

        await service.shutdown()
    })

    it('publishes periodically if user has said ok', async function () {
        stubGlobal()

        service.record(fakeMetric())

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        clock.tick(testFlushPeriod)
        await service.shutdown()

        assert.strictEqual(mockPublisher.flushCount, 1)
        assert.strictEqual(mockPublisher.queue.length, 2)
    })

    it('flushes over multiple intervals', async function () {
        stubGlobal()
        await service.start()

        // First interval
        service.record(fakeMetric({ value: 10 }))
        service.record(fakeMetric({ value: 11 }))
        await clock.tickAsync(testFlushPeriod)

        // Second interval
        service.record(fakeMetric({ value: 20 }))
        service.record(fakeMetric({ value: 21 }))
        await clock.tickAsync(testFlushPeriod)

        // Third interval
        service.record(fakeMetric({ value: 30 }))
        service.record(fakeMetric({ value: 31 }))
        await clock.tickAsync(testFlushPeriod)

        await service.shutdown()

        assert.strictEqual(mockPublisher.flushCount, 3)
        assert.strictEqual(mockPublisher.queue.length, 7)
    })

    it('events automatically inject the active account id into the metadata', async function () {
        service = await initService(makeFakeAwsContextWithPlaceholderIds({} as any as AWS.Credentials))
        logger = service.logger
        service.record(fakeMetric({ metricName: 'name' }))

        assert.strictEqual(logger.metricCount, 1)

        const metrics = logger.queryFull({ metricName: 'name' })
        assertMetadataContainsTestAccount(metrics[0], defaultTestAccountId)
    })

    it('events with `session` namespace do not have an account tied to them', async function () {
        stubGlobal()

        await service.start()
        await service.shutdown()

        assert.strictEqual(logger.metricCount, 1)
        const startEvents = logger.queryFull({ metricName: 'session_start' })
        assertMetadataContainsTestAccount(startEvents[0], AccountStatus.NotApplicable)

        const shutdownEvents = logger.queryFull({ metricName: 'session_start' })
        assertMetadataContainsTestAccount(shutdownEvents[0], AccountStatus.NotApplicable)
    })

    it('events created with a bad active account produce metadata mentioning the bad account', async function () {
        service = await initService({ getCredentialAccountId: () => 'this is bad!' } as unknown as FakeAwsContext)
        logger = service.logger

        service.record(fakeMetric({ metricName: 'name' }))
        assert.strictEqual(logger.metricCount, 1)

        const metricDatum = logger.queryFull({ metricName: 'name' })
        assertMetadataContainsTestAccount(metricDatum[0], AccountStatus.Invalid)
    })

    it('events created prior to signing in do not have an account attached', async function () {
        service.record(fakeMetric({ metricName: 'name' }))
        assert.strictEqual(logger.metricCount, 1)

        const metricData = logger.queryFull({ metricName: 'name' })
        assertMetadataContainsTestAccount(metricData[0], AccountStatus.NotSet)
    })

    it('events are never recorded if telemetry has been disabled', async function () {
        stubGlobal()

        service.telemetryEnabled = false
        await service.start()

        // telemetry off: events are never recorded
        service.record(fakeMetric({ metricName: 'name' }))
        await service.shutdown()
        await clock.tickAsync(testFlushPeriod * 2)

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.queue.length, 0)
        // and events are not kept in memory
        assert.strictEqual(logger.metricCount, 0)
    })

    function assertMetadataContainsTestAccount(
        metricDatum: ClientTelemetry.MetricDatum | undefined,
        expectedAccountId: string
    ) {
        assert.ok(metricDatum, 'Metric datum was undefined')
        const metadata = metricDatum.Metadata
        assert.ok(metadata, 'Metric metadata was undefined')
        assert.ok(
            metadata.some(item => item.Key === 'awsAccount' && item.Value === expectedAccountId),
            'Expected metadata to contain the test account'
        )
    }
})
