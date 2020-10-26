/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import AWS = require('aws-sdk')
import { DefaultTelemetryPublisher } from '../../../shared/telemetry/defaultTelemetryPublisher'
import { TelemetryClient } from '../../../shared/telemetry/telemetryClient'
import { TelemetryFeedback } from '../../../shared/telemetry/telemetryFeedback'

class MockTelemetryClient implements TelemetryClient {
    public feedback?: TelemetryFeedback
    private readonly returnValue: any

    public constructor(returnValue?: any) {
        this.returnValue = returnValue
    }

    public async postMetrics(payload: any) {
        return this.returnValue
    }

    public async postFeedback(feedback: TelemetryFeedback) {
        this.feedback = feedback
    }
}

describe('DefaultTelemetryPublisher', () => {
    it('posts feedback', async () => {
        const client = new MockTelemetryClient()
        const publisher = new DefaultTelemetryPublisher('', '', new AWS.Credentials('', ''), client)

        const feedback = { comment: '', sentiment: '' }
        await publisher.postFeedback(feedback)

        assert.strictEqual(client.feedback, feedback)
    })

    it('enqueues events', () => {
        const publisher = new DefaultTelemetryPublisher('', '', new AWS.Credentials('', ''), new MockTelemetryClient())
        publisher.enqueue(...[{ MetricName: 'name', Value: 1, Unit: 'None', EpochTimestamp: new Date().getTime() }])
        assert.strictEqual(publisher.queue.length, 1)
        publisher.enqueue(...[{ MetricName: 'name3', Value: 1, Unit: 'None', EpochTimestamp: new Date().getTime() }])
        assert.strictEqual(publisher.queue.length, 2)
    })

    it('can flush single event', async () => {
        const publisher = new DefaultTelemetryPublisher('', '', new AWS.Credentials('', ''), new MockTelemetryClient())
        publisher.enqueue(...[{ MetricName: 'name', Value: 1, Unit: 'None', EpochTimestamp: new Date().getTime() }])

        assert.strictEqual(publisher.queue.length, 1)

        await publisher.flush()
        assert.strictEqual(publisher.queue.length, 0)
    })

    it('retains queue on flush failure', async () => {
        const batch = [{ MetricName: 'name', Value: 1, Unit: 'None', EpochTimestamp: new Date().getTime() }]
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
