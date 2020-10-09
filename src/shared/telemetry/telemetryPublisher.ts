/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MetricDatum } from './clienttelemetry'
import { TelemetryFeedback } from './telemetryFeedback'

export interface TelemetryPublisher {
    init(): Promise<void>

    postFeedback(feedback: TelemetryFeedback): Promise<void>

    enqueue(...events: MetricDatum[]): any
    flush(): Promise<any>
}
