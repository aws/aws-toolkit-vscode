/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TelemetryEvent } from './telemetryEvent'
import { TelemetryFeedback } from './telemetryFeedback'

export interface TelemetryClient {
    postMetrics(payload: TelemetryEvent[]): Promise<TelemetryEvent[] | undefined>
    postFeedback(feedback: TelemetryFeedback): Promise<void>
}
