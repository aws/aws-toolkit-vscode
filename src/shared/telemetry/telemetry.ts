/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TelemetryTracer } from './spans'
import { NumericKeys } from '../utilities/tsUtils'

// This file makes it so you can import 'telemetry' and not 'telemetry.gen'
export * from './telemetry.gen'

export function millisecondsSince(date: Date): number {
    return Date.now() - date.getTime()
}

export const telemetry = new TelemetryTracer()

// TODO: move this into `Metric` by updating the codegen
declare module './telemetry.gen' {
    interface Metric<T extends MetricBase = MetricBase> {
        increment(data: { [P in NumericKeys<T>]+?: number }): void
    }
}
