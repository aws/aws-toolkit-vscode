/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { TelemetryEvent, toMetricData } from '../../../shared/telemetry/telemetryEvent'

describe('TelemetryEventArray', () => {
    describe('toMetricData', () => {
        it('strips names of invalid characters', () => {
            const eventArray = []
            const metricEvents = [
                {
                    namespace: 'namesp$ace',
                    createTime: new Date()
                },
                {
                    namespace: 'namespace',
                    createTime: new Date(),
                    data: [
                        {
                            name: 'even#t1',
                            value: 1
                        },
                        {
                            name: 'event:2',
                            value: 0.5,
                            unit: 'Percent',
                            metadata: new Map([['key', 'value'], ['key2', 'value2']])
                        }
                    ]
                }
            ]

            eventArray.push(...metricEvents)
            const data = toMetricData(eventArray)

            assert.strictEqual(data.length, 3)
            assert.strictEqual(data[0].MetricName, 'namespace')
            assert.strictEqual(data[1].MetricName, 'namespace_event1')
            assert.strictEqual(data[2].MetricName, 'namespace_event:2')
        })

        it('maps TelemetryEvent with no data to a single MetricDatum', () => {
            const eventArray = []
            const metricEvent = {
                namespace: 'namespace',
                createTime: new Date()
            }
            eventArray.push(metricEvent)
            const data = toMetricData(eventArray)

            assert.strictEqual(data.length, 1)
            assert.strictEqual(data[0].EpochTimestamp, metricEvent.createTime.getTime())
            assert.strictEqual(data[0].MetricName, metricEvent.namespace)
            assert.deepStrictEqual(data[0].Metadata, undefined)
        })

        it('maps TelemetryEvent with data to a multiple MetricDatum', () => {
            const eventArray: TelemetryEvent[] = []
            const metricEvent = {
                namespace: 'namespace',
                createTime: new Date(),
                data: [
                    {
                        name: 'event1',
                        value: 1
                    },
                    {
                        name: 'event2',
                        value: 0.5,
                        unit: 'Percent',
                        metadata: new Map([['key', 'value'], ['key2', 'value2']])
                    },
                    {
                        name: 'event3',
                        value: 0.333,
                        unit: 'Percent',
                        metadata: new Map([['key3', 'value3']])
                    }
                ]
            }
            eventArray.push(metricEvent)
            const data = toMetricData(eventArray)

            assert.strictEqual(data.length, 3)
            assert.strictEqual(data[0].EpochTimestamp, metricEvent.createTime.getTime())
            assert.strictEqual(data[1].EpochTimestamp, metricEvent.createTime.getTime())
            assert.strictEqual(data[2].EpochTimestamp, metricEvent.createTime.getTime())
            assert.strictEqual(data[0].MetricName, 'namespace_event1')
            assert.strictEqual(data[1].MetricName, 'namespace_event2')
            assert.strictEqual(data[2].MetricName, 'namespace_event3')
            assert.strictEqual(data[0].Value, 1)
            assert.strictEqual(data[1].Value, 0.5)
            assert.strictEqual(data[2].Value, 0.333)
            assert.strictEqual(data[0].Unit, 'None')
            assert.strictEqual(data[1].Unit, 'Percent')
            assert.strictEqual(data[2].Unit, 'Percent')
            assert.deepStrictEqual(data[0].Metadata, undefined)

            const expectedMetadata1 = [{ Key: 'key', Value: 'value' }, { Key: 'key2', Value: 'value2' }]
            const expectedMetadata2 = [{ Key: 'key3', Value: 'value3' }]

            assert.deepStrictEqual(data[1].Metadata, expectedMetadata1)
            assert.deepStrictEqual(data[2].Metadata, expectedMetadata2)
        })

        it('always contains exactly one underscore in the metric name, separating the namespace and the name', () => {
            const properNamespace = 'namespace'
            const malformedNamespace = 'name_space'
            const properName = 'metricname'
            const malformedName = 'metric_name'
            const eventArray = [
                {
                    namespace: properNamespace,
                    createTime: new Date(),
                    data: [
                        {
                            name: properName,
                            value: 0
                        }
                    ]
                },
                {
                    namespace: malformedNamespace,
                    createTime: new Date(),
                    data: [
                        {
                            name: malformedName,
                            value: 0
                        }
                    ]
                }
            ]

            const data = toMetricData(eventArray)
            assert.strictEqual(data.length, 2)
            assert.strictEqual(data[0].MetricName, `${properNamespace}_${properName}`)
            assert.strictEqual(data[1].MetricName, `${properNamespace}_${properName}`)
        })
    })
})
