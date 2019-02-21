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

    public enqueue(events: any[]) {
        this.enqueueCount++
        this.enqueuedItems += events.length
    }
    public async flush() {
        this.flushCount++
    }
}

describe('DefaultTelemetryService', () => {
    it('publishes periodically', async () => {
        const mockContext = new FakeExtensionContext()
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockPublisher)
        service.telemetryEnabled = true
        service.setFlushPeriod(10)
        service.record({ namespace: 'name', createTime: new Date() })

        await service.start()
        assert.notStrictEqual(service.getTimer(), undefined)

        await new Promise<any>(resolve => setTimeout(resolve, 50))
        await service.shutdown()

        assert.notStrictEqual(mockPublisher.flushCount, 0)
        assert.notStrictEqual(mockPublisher.enqueuedItems, 0)
        assert.strictEqual(mockPublisher.enqueueCount, mockPublisher.flushCount)
    })

    it('no-op when telemetry disabled', async () => {
        const mockContext = new FakeExtensionContext()
        const mockPublisher = new MockTelemetryPublisher()
        const service = new DefaultTelemetryService(mockContext, mockPublisher)
        service.telemetryEnabled = false
        service.setFlushPeriod(10)
        service.record({ namespace: 'name', createTime: new Date() })

        await service.start()
        assert.notStrictEqual(service.getTimer(), undefined)

        await new Promise<any>(resolve => setTimeout(resolve, 50))
        await service.shutdown()

        // events are never flushed
        assert.strictEqual(mockPublisher.flushCount, 0)
        assert.strictEqual(mockPublisher.enqueueCount, 0)
        assert.strictEqual(mockPublisher.enqueuedItems, 0)
        // and any recorded events are kept
        assert.strictEqual(service.getRecords().length, 1)
    })
})
