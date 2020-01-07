/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import AWS = require('aws-sdk')
import { DefaultTelemetryPublisher } from '../../../shared/telemetry/defaultTelemetryPublisher'
import { TelemetryClient } from '../../../shared/telemetry/telemetryClient'

class MockTelemetryClient implements TelemetryClient {
    private readonly returnValue: any

    public constructor(returnValue?: any) {
        this.returnValue = returnValue
    }

    public async postMetrics(payload: any) {
        return this.returnValue
    }
}

describe('DefaultTelemetryPublisher', () => {
    it('enqueues events', () => {
        const publisher = new DefaultTelemetryPublisher('', '', new AWS.Credentials('', ''), new MockTelemetryClient())
        publisher.enqueue(...[{ createTime: new Date(), data: [{ MetricName: 'name', Value: 1 }] }])
        assert.strictEqual(publisher.queue.length, 1)
        publisher.enqueue(...[{ createTime: new Date(), data: [{ MetricName: 'name3', Value: 1 }] }])
        assert.strictEqual(publisher.queue.length, 2)
    })

    it('can flush single event', async () => {
        const publisher = new DefaultTelemetryPublisher('', '', new AWS.Credentials('', ''), new MockTelemetryClient())
        publisher.enqueue(...[{ createTime: new Date(), data: [{ MetricName: 'name', Value: 1 }] }])

        assert.strictEqual(publisher.queue.length, 1)

        await publisher.flush()
        assert.strictEqual(publisher.queue.length, 0)
    })

    it('retains queue on flush failure', async () => {
        const batch = [{ createTime: new Date(), data: [{ MetricName: 'name', Value: 1 }] }]
        const publisher = new DefaultTelemetryPublisher(
            '',
            '',
            new AWS.Credentials('', ''),
            new MockTelemetryClient(batch)
        )
        publisher.enqueue(...batch)

        assert.strictEqual(publisher.queue.length, 1)

        await publisher.flush()
        assert.strictEqual(publisher.queue.length, 1)
        assert.strictEqual(publisher.queue[0], batch[0])
    })
})
