/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import AWS = require('aws-sdk')
import { DefaultTelemetryPublisher } from '../../../shared/telemetry/telemetryPublisher'
import { TelemetryClient, TelemetryFeedback } from '../../../shared/telemetry/telemetryClient'
import { fakeMetric } from './telemetryService.test'

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

describe('DefaultTelemetryPublisher', function () {
    it('posts feedback', async function () {
        const client = new MockTelemetryClient()
        const publisher = new DefaultTelemetryPublisher('', '', new AWS.Credentials('', ''), client)

        const feedback = { comment: '', sentiment: '' }
        await publisher.postFeedback(feedback)

        assert.strictEqual(client.feedback, feedback)
    })

    it('enqueues events', function () {
        const publisher = new DefaultTelemetryPublisher('', '', new AWS.Credentials('', ''), new MockTelemetryClient())
        publisher.enqueue(fakeMetric({ metricName: 'name' }))
        assert.strictEqual(publisher.queue.length, 1)
        publisher.enqueue(fakeMetric({ metricName: 'name2' }))
        assert.strictEqual(publisher.queue.length, 2)
    })

    it('can flush single event', async function () {
        const publisher = new DefaultTelemetryPublisher('', '', new AWS.Credentials('', ''), new MockTelemetryClient())
        publisher.enqueue(fakeMetric({ metricName: 'name' }))

        assert.strictEqual(publisher.queue.length, 1)

        await publisher.flush()
        assert.strictEqual(publisher.queue.length, 0)
    })

    it('retains queue on flush failure', async function () {
        const batch = [fakeMetric({ metricName: 'name' })]
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
