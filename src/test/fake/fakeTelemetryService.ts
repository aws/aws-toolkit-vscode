/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TelemetryPublisher } from '../../shared/telemetry/telemetryPublisher'
import { TelemetryFeedback } from '../../shared/telemetry/telemetryClient'
import { MetricDatum } from '../../shared/telemetry/clienttelemetry'

export class FakeTelemetryPublisher implements TelemetryPublisher {
    private readonly _eventQueue: MetricDatum[] = []
    /** How many times flush() was called. */
    public flushCount = 0
    /** How many times enqueue() was called. */
    public enqueueCount = 0

    public feedback?: TelemetryFeedback

    public async init() {}

    public async postFeedback(feedback: TelemetryFeedback): Promise<void> {
        this.feedback = feedback
    }

    public enqueue(...events: any[]) {
        this.enqueueCount++
        this._eventQueue.push(...events)
    }

    public get queue(): MetricDatum[] {
        return this._eventQueue
    }

    public async flush() {
        this.flushCount++
    }
}
