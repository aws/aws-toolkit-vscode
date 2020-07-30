/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TelemetryPublisher } from '../../shared/telemetry/telemetryPublisher'
import { TelemetryFeedback } from '../../shared/telemetry/telemetryFeedback'

export class FakeTelemetryPublisher implements TelemetryPublisher {
    public flushCount = 0
    public enqueueCount = 0
    public enqueuedItems = 0

    public feedback?: TelemetryFeedback

    public async init() {}

    public async postFeedback(feedback: TelemetryFeedback): Promise<void> {
        this.feedback = feedback
    }

    public enqueue(...events: any[]) {
        this.enqueueCount++
        this.enqueuedItems += events.length
    }

    public async flush() {
        this.flushCount++
    }
}
