/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { DefaultTelemetryService } from '../../../shared/telemetry/defaultTelemetryService'
import { TelemetryPublisher } from '../../../shared/telemetry/telemetryPublisher'
import { AccountStatus } from '../../../shared/telemetry/telemetryTypes'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { DEFAULT_TEST_ACCOUNT_ID, FakeAwsContext } from '../../utilities/fakeAwsContext'

class MockTelemetryPublisher implements TelemetryPublisher {
    public flushCount = 0
    public enqueueCount = 0
    public enqueuedItems = 0

    public async init() {}

    public enqueue(...events: any[]) {
        this.enqueueCount++
        this.enqueuedItems += events.length
    }

    public async flush() {
        this.flushCount++
    }
}

describe('DefaultTelemetryService', () => {
    it('publishes periodically if user has said ok', async () => {
        const mockContext = new FakeExtensionContext()
        const mockAws = new FakeAwsContext()
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockAws, mockPublisher)
        service.clearRecords()
        service.telemetryEnabled = true
        service.notifyOptOutOptionMade()
        service.flushPeriod = 10
        service.record({ namespace: 'name', createTime: new Date() })

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        await new Promise<any>(resolve => setTimeout(resolve, 50))
        await service.shutdown()

        assert.notStrictEqual(mockPublisher.flushCount, 0)
        assert.notStrictEqual(mockPublisher.enqueuedItems, 0)
        assert.strictEqual(mockPublisher.enqueueCount, mockPublisher.flushCount)
    })

    it('events are kept in memory if user has not made a decision', async () => {
        const mockContext = new FakeExtensionContext()
        const mockAws = new FakeAwsContext()
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockAws, mockPublisher)
        service.clearRecords()
        service.telemetryEnabled = false
        service.flushPeriod = 10
        service.record({ namespace: 'name', createTime: new Date() })

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        await new Promise<any>(resolve => setTimeout(resolve, 50))
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.enqueuedItems, 0)
        // and events are kept in memory
        assert.strictEqual(service.records.length, 3)
        // events are, in order, the dummy test event, the start event, and the shutdown event
        // test event is first since we record it before starting the service
        assert.strictEqual(service.records[0].namespace, 'name')
        assert.strictEqual(service.records[1].namespace, 'session')
        assert.strictEqual(service.records[1].data![0].name, 'start')
        assert.strictEqual(service.records[2].namespace, 'session')
        assert.strictEqual(service.records[2].data![0].name, 'end')
    })

    it('events automatically inject the active account id into the metadata', async () => {
        const mockContext = new FakeExtensionContext()
        const mockAws = new FakeAwsContext()
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockAws, mockPublisher)
        service.clearRecords()
        service.telemetryEnabled = false
        service.flushPeriod = 10
        service.record({ namespace: 'name', createTime: new Date() })

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        await new Promise<any>(resolve => setTimeout(resolve, 50))
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.enqueuedItems, 0)
        // and events are kept in memory
        assert.strictEqual(service.records.length, 3)
        // events are, in order, the dummy test event, the start event, and the shutdown event
        // test event is first since we record it before starting the service
        assert.strictEqual(service.records[0].namespace, 'name')
        assert.strictEqual(service.records[0].data![0].metadata!.get('awsAccount'), DEFAULT_TEST_ACCOUNT_ID)
    })

    it('events with `session` namespace do not have an account tied to them', async () => {
        const mockContext = new FakeExtensionContext()
        const mockAws = new FakeAwsContext()
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockAws, mockPublisher)
        service.clearRecords()
        service.telemetryEnabled = false
        service.flushPeriod = 10

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        await new Promise<any>(resolve => setTimeout(resolve, 50))
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.enqueuedItems, 0)
        // and events are kept in memory
        assert.strictEqual(service.records.length, 2)
        // events are, in order, the dummy test event, the start event, and the shutdown event
        // test event is first since we record it before starting the service
        assert.strictEqual(service.records[0].namespace, 'session')
        assert.strictEqual(service.records[0].data![0].name, 'start')
        assert.strictEqual(service.records[0].data![0].metadata!.get('awsAccount'), AccountStatus.NotApplicable)
        assert.strictEqual(service.records[1].namespace, 'session')
        assert.strictEqual(service.records[1].data![0].name, 'end')
        assert.strictEqual(service.records[1].data![0].metadata!.get('awsAccount'), AccountStatus.NotApplicable)
    })

    it('events created with a bad active account produce metadata mentioning the bad account', async () => {
        const mockContext = new FakeExtensionContext()
        const mockAws = new FakeAwsContext({accountId: 'this is bad!'})
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockAws, mockPublisher)
        service.clearRecords()
        service.telemetryEnabled = false
        service.flushPeriod = 10
        service.record({ namespace: 'name', createTime: new Date() })

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        await new Promise<any>(resolve => setTimeout(resolve, 50))
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.enqueuedItems, 0)
        // and events are kept in memory
        assert.strictEqual(service.records.length, 3)
        // events are, in order, the dummy test event, the start event, and the shutdown event
        // test event is first since we record it before starting the service
        assert.strictEqual(service.records[0].namespace, 'name')
        assert.strictEqual(service.records[0].data![0].metadata!.get('awsAccount'), AccountStatus.Invalid)
    })

    it('events created prior to signing in do not have an account attached', async () => {
        const mockContext = new FakeExtensionContext()
        const mockAws = new FakeAwsContext({allowUndefined: true})
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockAws, mockPublisher)
        service.clearRecords()
        service.telemetryEnabled = false
        service.flushPeriod = 10
        service.record({ namespace: 'name', createTime: new Date() })

        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        await new Promise<any>(resolve => setTimeout(resolve, 50))
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.enqueuedItems, 0)
        // and events are kept in memory
        assert.strictEqual(service.records.length, 3)
        // events are, in order, the dummy test event, the start event, and the shutdown event
        // test event is first since we record it before starting the service
        assert.strictEqual(service.records[0].namespace, 'name')
        assert.strictEqual(service.records[0].data![0].metadata!.get('awsAccount'), AccountStatus.NotSet)
    })

    it('events are never recorded if telemetry has been disabled', async () => {
        const mockContext = new FakeExtensionContext()
        const mockAws = new FakeAwsContext()
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockAws, mockPublisher)
        service.clearRecords()
        service.telemetryEnabled = false
        service.notifyOptOutOptionMade()
        service.flushPeriod = 10
        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        // telemetry off: events are never recorded
        service.record({ namespace: 'name', createTime: new Date() })

        await new Promise<any>(resolve => setTimeout(resolve, 50))
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.enqueuedItems, 0)
        // and events are not kept in memory
        assert.strictEqual(service.records.length, 0)
    })

    it('events are cleared after user disables telemetry via prompt', async () => {
        const mockContext = new FakeExtensionContext()
        const mockAws = new FakeAwsContext()
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockAws, mockPublisher)
        service.clearRecords()

        service.flushPeriod = 10
        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        // event recorded while decision has not been made
        service.record({ namespace: 'name', createTime: new Date() })
        assert.notStrictEqual(service.records.length, 0)

        // user disables telemetry and events are cleared
        service.telemetryEnabled = false
        service.notifyOptOutOptionMade()
        assert.strictEqual(service.records.length, 0)

        await new Promise<any>(resolve => setTimeout(resolve, 50))
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.enqueuedItems, 0)
        // and events are not kept in memory
        assert.strictEqual(service.records.length, 0)
    })

    it('events are kept after user enables telemetry via prompt', async () => {
        const mockContext = new FakeExtensionContext()
        const mockAws = new FakeAwsContext()
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockAws, mockPublisher)
        service.clearRecords()

        service.flushPeriod = 10
        await service.start()
        assert.notStrictEqual(service.timer, undefined)

        // event recorded while decision has not been made
        service.record({ namespace: 'name', createTime: new Date() })
        assert.notStrictEqual(service.records.length, 0)

        // user enables telemetry and events are kept
        service.telemetryEnabled = true
        service.notifyOptOutOptionMade()
        assert.notStrictEqual(service.records.length, 0)

        await new Promise<any>(resolve => setTimeout(resolve, 50))
        await service.shutdown()

        // events are flushed
        assert.notStrictEqual(mockPublisher.flushCount, 0)
        assert.notStrictEqual(mockPublisher.enqueuedItems, 0)
        assert.strictEqual(mockPublisher.enqueueCount, mockPublisher.flushCount)
    })
})
