/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as sinon from 'sinon'
import * as fs from 'fs-extra'
import { AwsContext } from '../../../shared/awsContext'
import { DefaultTelemetryService } from '../../../shared/telemetry/defaultTelemetryService'
import { AccountStatus } from '../../../shared/telemetry/telemetryTypes'
import { FakeExtensionContext } from '../../fakeExtensionContext'

import { ext } from '../../../shared/extensionGlobals'
import { TelemetryService } from '../../../shared/telemetry/telemetryService'
import {
    DEFAULT_TEST_ACCOUNT_ID,
    FakeAwsContext,
    makeFakeAwsContextWithPlaceholderIds,
} from '../../utilities/fakeAwsContext'
import { FakeTelemetryPublisher } from '../../fake/fakeTelemetryService'
import ClientTelemetry = require('../../../shared/telemetry/clienttelemetry')
import { assertThrowsError } from '../utilities/assertUtils'

const originalTelemetryClient: TelemetryService = ext.telemetry
let mockContext: FakeExtensionContext
let mockAws: FakeAwsContext
let mockPublisher: FakeTelemetryPublisher
let service: DefaultTelemetryService

beforeEach(function () {
    mockContext = new FakeExtensionContext()
    mockAws = new FakeAwsContext()
    mockPublisher = new FakeTelemetryPublisher()
    service = new DefaultTelemetryService(mockContext, mockAws, undefined, mockPublisher)
    ext.telemetry = service
})

afterEach(async function () {
    // Remove the persist file as it is saved
    await fs.remove(ext.telemetry.persistFilePath)
    ext.telemetry = originalTelemetryClient
})

function fakeMetric(value: number, passive: boolean) {
    return {
        Passive: passive,
        MetricName: `metric${value}`,
        Value: value,
        Unit: 'None',
        EpochTimestamp: new Date().getTime(),
    }
}

describe('DefaultTelemetryService', function () {
    const testFlushPeriod = 10
    let clock: sinon.SinonFakeTimers
    let sandbox: sinon.SinonSandbox

    before(function () {
        sandbox = sinon.createSandbox()
        clock = FakeTimers.install()
    })

    after(function () {
        clock.uninstall()
        sandbox.restore()
    })

    it('posts feedback', async function () {
        service.telemetryEnabled = false
        const feedback = { comment: '', sentiment: '' }
        await service.postFeedback(feedback)

        assert.strictEqual(mockPublisher.feedback, feedback)
    })

    it('assertPassiveTelemetry() throws if active, non-cached metric is emitted during startup', async function () {
        service.clearRecords()
        service.telemetryEnabled = true
        service.flushPeriod = testFlushPeriod

        // Simulate cached telemetry by prepopulating records before start().
        // (Normally readEventsFromCache() does this.)
        service.record(fakeMetric(1, true))
        service.record(fakeMetric(2, true))
        // Active *cached* metric.
        service.record(fakeMetric(4, false))
        await service.start()

        // Passive *non-cached* metric.
        service.record(fakeMetric(5, true))

        // Must *not* throw.
        service.assertPassiveTelemetry(false)

        // Active *non-cached* metric.
        service.record(fakeMetric(6, false))

        // Must throw.
        assertThrowsError(async () => {
            service.assertPassiveTelemetry(false)
        })

        await service.shutdown()
    })

    it('publishes periodically if user has said ok', async function () {
        service.clearRecords()
        service.telemetryEnabled = true
        service.flushPeriod = testFlushPeriod
        service.record({ MetricName: 'namespace', Value: 1, Unit: 'None', EpochTimestamp: new Date().getTime() })

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        clock.tick(testFlushPeriod + 1)
        await service.shutdown()

        assert.notStrictEqual(mockPublisher.flushCount, 0)
        assert.notStrictEqual(mockPublisher.queue.length, 0)
        assert.strictEqual(mockPublisher.enqueueCount, mockPublisher.flushCount)
    })

    it('events automatically inject the active account id into the metadata', async function () {
        const mockAwsWithIds = makeFakeAwsContextWithPlaceholderIds(({} as any) as AWS.Credentials)
        service = new DefaultTelemetryService(mockContext, mockAwsWithIds, undefined, mockPublisher)
        ext.telemetry = service
        service.clearRecords()
        service.telemetryEnabled = true
        service.flushPeriod = testFlushPeriod
        service.record({ MetricName: 'name', Value: 1, Unit: 'None', EpochTimestamp: new Date().getTime() })

        assert.strictEqual(service.records.length, 1)

        const metricDatum = service.records[0]
        assert.strictEqual(metricDatum.MetricName, 'name')
        assertMetadataContainsTestAccount(metricDatum, DEFAULT_TEST_ACCOUNT_ID)
    })

    it('events with `session` namespace do not have an account tied to them', async function () {
        service.clearRecords()
        service.telemetryEnabled = true
        service.flushPeriod = testFlushPeriod

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        await service.shutdown()

        assert.strictEqual(service.records.length, 2)
        // events are, in order, the start event, and the shutdown event
        const startEvent = service.records[0]
        assert.strictEqual(startEvent.MetricName, 'session_start')
        assertMetadataContainsTestAccount(startEvent, AccountStatus.NotApplicable)

        const shutdownEvent = service.records[1]
        assert.strictEqual(shutdownEvent.MetricName, 'session_end')
        assertMetadataContainsTestAccount(shutdownEvent, AccountStatus.NotApplicable)
    })

    it('events created with a bad active account produce metadata mentioning the bad account', async function () {
        const mockAwsBad = ({
            getCredentialAccountId: () => 'this is bad!',
        } as any) as AwsContext
        service = new DefaultTelemetryService(mockContext, mockAwsBad, undefined, mockPublisher)
        ext.telemetry = service
        service.clearRecords()
        service.telemetryEnabled = true
        service.flushPeriod = testFlushPeriod
        service.record({ MetricName: 'name', Value: 1, Unit: 'None', EpochTimestamp: new Date().getTime() })

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        await service.shutdown()

        assert.strictEqual(service.records.length, 3)
        // events are, in order, the dummy test event, the start event, and the shutdown event
        // test event is first since we record it before starting the service
        const metricDatum = service.records[0]
        assert.strictEqual(metricDatum.MetricName, 'name')
        assertMetadataContainsTestAccount(metricDatum, AccountStatus.Invalid)
    })

    it('events created prior to signing in do not have an account attached', async function () {
        service.clearRecords()
        service.telemetryEnabled = true
        service.flushPeriod = testFlushPeriod
        service.record({ MetricName: 'name', Value: 1, Unit: 'None', EpochTimestamp: new Date().getTime() })

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        await service.shutdown()

        assert.strictEqual(service.records.length, 3)
        // events are, in order, the dummy test event, the start event, and the shutdown event
        // test event is first since we record it before starting the service
        const metricDatum = service.records[0]
        assert.strictEqual(metricDatum.MetricName, 'name')
        assertMetadataContainsTestAccount(metricDatum, AccountStatus.NotSet)
    })

    it('events are never recorded if telemetry has been disabled', async function () {
        service.clearRecords()
        service.telemetryEnabled = false
        service.flushPeriod = testFlushPeriod
        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        // telemetry off: events are never recorded
        service.record({ MetricName: 'name', Value: 1, Unit: 'None', EpochTimestamp: new Date().getTime() })

        clock.tick(testFlushPeriod + 1)
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.queue.length, 0)
        // and events are not kept in memory
        assert.strictEqual(service.records.length, 0)
    })

    function assertMetadataContainsTestAccount(metricDatum: ClientTelemetry.MetricDatum, expectedAccountId: string) {
        assert.ok(
            metricDatum.Metadata!.some(item => item.Key === 'awsAccount' && item.Value === expectedAccountId),
            'Expected metadata to contain the test account'
        )
    }
})
