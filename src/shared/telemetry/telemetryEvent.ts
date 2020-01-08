/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MetricDatum } from './clienttelemetry'

const NAME_ILLEGAL_CHARS_REGEX = new RegExp('[^\\w+-.:]', 'g')

export interface TelemetryEvent {
    createTime: Date
    data: MetricDatum[]
}

export function toMetricData(array: TelemetryEvent[]): MetricDatum[] {
    return ([] as MetricDatum[]).concat(
        ...array
            .filter(item => {
                return item.data !== undefined
            })
            .map(metricEvent =>
                metricEvent.data.map(datum => {
                    return {
                        MetricName: datum.MetricName?.replace(NAME_ILLEGAL_CHARS_REGEX, ''),
                        EpochTimestamp: metricEvent.createTime.getTime(),
                        Unit: datum.Unit ?? 'None',
                        Value: datum.Value,
                        Metadata: datum.Metadata
                    }
                })
            )
    )
}
