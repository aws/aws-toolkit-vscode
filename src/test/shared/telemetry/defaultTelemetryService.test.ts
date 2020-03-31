/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
// tslint:disable-next-line:no-implicit-dependencies
import * as lolex from 'lolex'
import * as sinon from 'sinon'
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

const originalTelemetryClient: TelemetryService = ext.telemetry
let mockContext: FakeExtensionContext
let mockAws: FakeAwsContext
let mockPublisher: FakeTelemetryPublisher
let service: DefaultTelemetryService

beforeEach(() => {
    mockContext = new FakeExtensionContext()
    mockAws = new FakeAwsContext()
    mockPublisher = new FakeTelemetryPublisher()
    service = new DefaultTelemetryService(mockContext, mockAws, mockPublisher)
    ext.telemetry = service
})

afterEach(() => {
    // Remove the persist file as it is saved
    del.sync([ext.telemetry.persistFilePath], { force: true })
    ext.telemetry = originalTelemetryClient
})

describe('DefaultTelemetryService', () => {
    const testFlushPeriod = 10
    let clock: lolex.InstalledClock
    let sandbox: sinon.SinonSandbox

    before(() => {
        sandbox = sinon.createSandbox()
        clock = lolex.install()
    })

    after(() => {
        clock.uninstall()
        sandbox.restore()
    })

    it('posts feedback', async () => {
        service.telemetryEnabled = false
        const feedback = { comment: '', sentiment: '' }
        await service.postFeedback(feedback)

        assert.strictEqual(mockPublisher.feedback, feedback)
    })

    it('publishes periodically if user has said ok', async () => {
        service.clearRecords()
        service.telemetryEnabled = true
        service.notifyOptOutOptionMade()
        service.flushPeriod = testFlushPeriod
        service.record({ createTime: new Date(), data: [{ MetricName: 'namespace', Value: 1 }] })

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        clock.tick(testFlushPeriod + 1)
        await service.shutdown()

        assert.notStrictEqual(mockPublisher.flushCount, 0)
        assert.notStrictEqual(mockPublisher.enqueuedItems, 0)
        assert.strictEqual(mockPublisher.enqueueCount, mockPublisher.flushCount)
    })

    it('events are kept in memory if user has not made a decision', async () => {
        ext.telemetry = service
        service.clearRecords()
        service.telemetryEnabled = false
        service.flushPeriod = testFlushPeriod
        service.record({ createTime: new Date(), data: [{ MetricName: 'name', Value: 1 }] })

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        clock.tick(testFlushPeriod + 1)
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.enqueuedItems, 0)
        // and events are kept in memory
        assert.strictEqual(service.records.length, 3)
        // events are, in order, the dummy test event, the start event, and the shutdown event
        // test event is first since we record it before starting the service
        assert.strictEqual(service.records[0].data![0].MetricName, 'name')
        assert.strictEqual(service.records[1].data![0].MetricName, 'session_start')
        assert.strictEqual(service.records[2].data![0].MetricName, 'session_end')
    })

    it('events automatically inject the active account id into the metadata', async () => {
        const mockAwsWithIds = makeFakeAwsContextWithPlaceholderIds(({} as any) as AWS.Credentials)
        service = new DefaultTelemetryService(mockContext, mockAwsWithIds, mockPublisher)
        ext.telemetry = service
        service.clearRecords()
        service.telemetryEnabled = false
        service.flushPeriod = testFlushPeriod
        service.record({ createTime: new Date(), data: [{ MetricName: 'name', Value: 1 }] })

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        clock.tick(testFlushPeriod + 1)
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.enqueuedItems, 0)
        // and events are kept in memory
        assert.strictEqual(service.records.length, 3)
        // events are, in order, the dummy test event, the start event, and the shutdown event
        // test event is first since we record it before starting the service
        assert.strictEqual(service.records[0].data![0].MetricName, 'name')
        assert.strictEqual(
            service.records[0].data![0].Metadata!.find(item => item.Key === 'awsAccount')?.Value,
            DEFAULT_TEST_ACCOUNT_ID
        )
    })

    it('events with `session` namespace do not have an account tied to them', async () => {
        service.clearRecords()
        service.telemetryEnabled = false
        service.flushPeriod = testFlushPeriod

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        clock.tick(testFlushPeriod + 1)
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.enqueuedItems, 0)
        // and events are kept in memory
        assert.strictEqual(service.records.length, 2)
        // events are, in order, the dummy test event, the start event, and the shutdown event
        // test event is first since we record it before starting the service
        assert.strictEqual(service.records[0].data![0].MetricName, 'session_start')
        assert.strictEqual(
            service.records[0].data![0].Metadata!.find(item => item.Key === 'awsAccount')?.Value,
            AccountStatus.NotApplicable
        )
        assert.strictEqual(service.records[1].data![0].MetricName, 'session_end')
        assert.strictEqual(
            service.records[1].data![0].Metadata!.find(item => item.Key === 'awsAccount')?.Value,
            AccountStatus.NotApplicable
        )
    })

    it('events created with a bad active account produce metadata mentioning the bad account', async () => {
        const mockAwsBad = ({
            getCredentialAccountId: () => 'this is bad!',
        } as any) as AwsContext
        service = new DefaultTelemetryService(mockContext, mockAwsBad, mockPublisher)
        ext.telemetry = service
        service.clearRecords()
        service.telemetryEnabled = false
        service.flushPeriod = testFlushPeriod
        service.record({ createTime: new Date(), data: [{ MetricName: 'name', Value: 1 }] })

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        clock.tick(testFlushPeriod + 1)
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.enqueuedItems, 0)
        // and events are kept in memory
        assert.strictEqual(service.records.length, 3)
        // events are, in order, the dummy test event, the start event, and the shutdown event
        // test event is first since we record it before starting the service
        assert.strictEqual(service.records[0].data![0].MetricName, 'name')
        assert.strictEqual(
            service.records[0].data![0].Metadata!.find(item => item.Key === 'awsAccount')?.Value,
            AccountStatus.Invalid
        )
    })

    it('events created prior to signing in do not have an account attached', async () => {
        service.clearRecords()
        service.telemetryEnabled = false
        service.flushPeriod = testFlushPeriod
        service.record({ createTime: new Date(), data: [{ MetricName: 'name', Value: 1 }] })

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        clock.tick(testFlushPeriod + 1)
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.enqueuedItems, 0)
        // and events are kept in memory
        assert.strictEqual(service.records.length, 3)
        // events are, in order, the dummy test event, the start event, and the shutdown event
        // test event is first since we record it before starting the service
        assert.strictEqual(service.records[0].data![0].MetricName, 'name')
        assert.strictEqual(
            service.records[0].data![0].Metadata!.find(item => item.Key === 'awsAccount')?.Value,
            AccountStatus.NotSet
        )
    })

    it('events are never recorded if telemetry has been disabled', async () => {
        service.clearRecords()
        service.telemetryEnabled = false
        service.notifyOptOutOptionMade()
        service.flushPeriod = testFlushPeriod
        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        // telemetry off: events are never recorded
        service.record({ createTime: new Date(), data: [{ MetricName: 'name', Value: 1 }] })

        clock.tick(testFlushPeriod + 1)
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.enqueuedItems, 0)
        // and events are not kept in memory
        assert.strictEqual(service.records.length, 0)
    })

    it('events are cleared after user disables telemetry via prompt', async () => {
        service.clearRecords()

        service.flushPeriod = testFlushPeriod
        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        // event recorded while decision has not been made
        service.record({ createTime: new Date(), data: [{ MetricName: 'namespace', Value: 1 }] })
        assert.notStrictEqual(service.records.length, 0)

        // user disables telemetry and events are cleared
        service.telemetryEnabled = false
        service.notifyOptOutOptionMade()
        assert.strictEqual(service.records.length, 0)

        clock.tick(testFlushPeriod + 1)
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.enqueuedItems, 0)
        // and events are not kept in memory
        assert.strictEqual(service.records.length, 0)
    })

    it('events are kept after user enables telemetry via prompt', async () => {
        service.clearRecords()

        service.flushPeriod = testFlushPeriod
        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        // event recorded while decision has not been made
        service.record({ createTime: new Date(), data: [{ MetricName: 'namespace', Value: 1 }] })
        assert.notStrictEqual(service.records.length, 0)

        // user enables telemetry and events are kept
        service.telemetryEnabled = true
        service.notifyOptOutOptionMade()
        assert.notStrictEqual(service.records.length, 0)

        clock.tick(testFlushPeriod + 1)
        await service.shutdown()

        // events are flushed
        assert.notStrictEqual(mockPublisher.flushCount, 0)
        assert.notStrictEqual(mockPublisher.enqueuedItems, 0)
        assert.strictEqual(mockPublisher.enqueueCount, mockPublisher.flushCount)
    })
})
