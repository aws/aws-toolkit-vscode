/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

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
        publisher.enqueue(...[
            { namespace: 'name', createTime: new Date() },
        ])

        assert.strictEqual(publisher.queue.length, 1)

        publisher.enqueue(...[
            { namespace: 'name2', createTime: new Date() },
            { namespace: 'name3', createTime: new Date() },
        ])

        assert.strictEqual(publisher.queue.length, 3)
    })

    it('can flush single event', async () => {
        const publisher = new DefaultTelemetryPublisher('', '', new AWS.Credentials('', ''), new MockTelemetryClient())
        publisher.enqueue(...[
            { namespace: 'name', createTime: new Date() },
        ])

        assert.strictEqual(publisher.queue.length, 1)

        await publisher.flush()
        assert.strictEqual(publisher.queue.length, 0)
    })

    it('retains queue on flush failure', async () => {
        const batch = [
            { namespace: 'name', createTime: new Date() },
        ]
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
