/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MetadataEntry, MetricDatum } from './clienttelemetry'
import { Datum } from './telemetryTypes'

const NAME_ILLEGAL_CHARS_REGEX = new RegExp('[^\\w+-.:]', 'g')

export interface TelemetryEvent {
    createTime: Date
    data: Datum[]
}

export function toMetricData(array: TelemetryEvent[]): MetricDatum[] {
    return ([] as MetricDatum[]).concat(
        ...array
            .filter(item => {
                return item.data !== undefined
            })
            .map(metricEvent =>
                metricEvent.data.map(datum => {
                    let metadata: MetadataEntry[] | undefined
                    let unit = datum.unit

                    if (datum.metadata !== undefined) {
                        metadata = Array.from(datum.metadata).map(entry => {
                            return { Key: entry[0], Value: entry[1] }
                        })
                    }

                    if (unit === undefined) {
                        unit = 'None'
                    }

                    return {
                        MetricName: datum.name.replace(NAME_ILLEGAL_CHARS_REGEX, ''),
                        EpochTimestamp: metricEvent.createTime.getTime(),
                        Unit: unit,
                        Value: datum.value,
                        Metadata: metadata
                    }
                })
            )
    )
}
