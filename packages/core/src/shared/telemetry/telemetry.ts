/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanOptions, TelemetryTracer } from './spans'
import { NumericKeys } from '../utilities/tsUtils'

// This file makes it so you can import 'telemetry' and not 'telemetry.gen'
export * from './telemetry.gen'

export function millisecondsSince(date: Date): number {
    return Date.now() - date.getTime()
}

export const telemetry = new TelemetryTracer()

/**
 * The following are overrides or additions to the actual './telemetry.gen'
 *
 * This is not a permanent solution, but a temporary override.
 * Look to add any permanent solutions to: https://github.com/aws/aws-toolkit-common/tree/main/telemetry/vscode
 */
declare module './telemetry.gen' {
    interface Metric<T extends MetricBase = MetricBase> {
        run<U>(fn: (span: Span<T>) => U, options?: SpanOptions): U
    }

    interface Span<T extends MetricBase = MetricBase> {
        increment(data: { [P in NumericKeys<T>]+?: number }): void
    }
}
