/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { DefaultTelemetryService } from '../../../shared/telemetry/defaultTelemetryService'
import { TelemetryPublisher } from '../../../shared/telemetry/telemetryPublisher'
import { FakeExtensionContext } from '../../fakeExtensionContext'

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
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockPublisher)
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
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockPublisher)
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
        assert.strictEqual(service.records[1].namespace, 'ToolkitStart')
        assert.strictEqual(service.records[2].namespace, 'ToolkitEnd')
    })

    it('events are never recorded if telemetry has been disabled', async () => {
        const mockContext = new FakeExtensionContext()
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockPublisher)
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
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockPublisher)
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
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockPublisher)
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
