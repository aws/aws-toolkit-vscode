/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { MetadataEntry, MetricDatum, Unit } from './clienttelemetry'

export interface Datum {
    name: string
    value: number
    unit?: Unit
    metadata?: Map<string, string>
}

export interface TelemetryEvent {
    namespace: string
    createTime: Date
    data?: Datum[]
}

export class TelemetryEventArray extends Array<TelemetryEvent> {
    public toMetricData() {
        const metricData = new Array<MetricDatum>()

        return metricData.concat(
            ...this.map( metricEvent => {
                if (metricEvent.data !== undefined) {
                    const mappedEventData = metricEvent.data.map( datum => {
                        let metadata: MetadataEntry[]
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
                            MetricName: `${metricEvent.namespace}.${datum.name}`,
                            EpochTimestamp: metricEvent.createTime.getTime(),
                            Unit: unit,
                            Value: datum.value,
                            Metadata: metadata!!
                        }
                    })

                    return mappedEventData
                }

                // case where there are no datum attached to the event, but we should still publish this
                return {
                    MetricName: metricEvent.namespace,
                    EpochTimestamp: metricEvent.createTime.getTime(),
                    Unit: 'None',
                    Value: 0
                }
            })
        )
    }
}
