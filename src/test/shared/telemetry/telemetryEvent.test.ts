/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { TelemetryEvent, toMetricData } from '../../../shared/telemetry/telemetryEvent'

describe('TelemetryEventArray', () => {
    describe('toMetricData', () => {
        const createTime = new Date().getTime()
        it('strips names of invalid characters', () => {
            const eventArray = []
            const metricEvents = [
                {
                    data: [
                        {
                            MetricName: 'namespace',
                            Value: 1,
                            Unit: 'None',
                            EpochTimestamp: createTime,
                        },
                        {
                            MetricName: 'namespace_even#t1',
                            Value: 1,
                            Unit: 'None',
                            EpochTimestamp: createTime,
                        },
                        {
                            MetricName: 'namespace_event:2',
                            Value: 0.5,
                            EpochTimestamp: createTime,
                            Unit: 'Percent',
                            metadata: [
                                { Key: 'key', Value: 'value' },
                                { Key: 'key2', Value: 'value2' },
                            ],
                        },
                    ],
                },
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
                data: [{ MetricName: 'namespace', Value: 1, Unit: 'None', EpochTimestamp: new Date().getTime() }],
            }
            eventArray.push(metricEvent)
            const data = toMetricData(eventArray)

            assert.strictEqual(data.length, 1)
            assert.strictEqual(data[0].MetricName, 'namespace')
            assert.deepStrictEqual(data[0].Metadata, undefined)
        })

        it('Rejects entries that have null Value', () => {
            const eventArray: TelemetryEvent[] = []
            const createTime = new Date().getTime()
            const metricEvent = {
                data: [
                    {
                        MetricName: 'namespace_event2',
                        Value: (undefined as unknown) as number,
                        EpochTimestamp: createTime,
                        Unit: 'Percent',
                        Metadata: [
                            { Key: 'key', Value: 'value' },
                            { Key: 'key2', Value: 'value2' },
                        ],
                    },
                    {
                        MetricName: 'namespace_event3',
                        Unit: 'Percent',
                        EpochTimestamp: createTime,
                        Value: 0.333,
                        Metadata: [{ Key: 'key3', Value: 'value3' }],
                    },
                ],
            }
            eventArray.push(metricEvent)
            const data = toMetricData(eventArray)
            assert.strictEqual(data.length, 1)
        })

        it('Rejects entries that have null MetricName', () => {
            const eventArray: TelemetryEvent[] = []
            const createTime = new Date().getTime()
            const metricEvent = {
                data: [
                    {
                        MetricName: (undefined as unknown) as string,
                        Unit: 'None',
                        EpochTimestamp: createTime,
                        Value: 1,
                    },
                    {
                        MetricName: 'namespace_event3',
                        Unit: 'Percent',
                        EpochTimestamp: createTime,
                        Value: 0.333,
                        Metadata: [{ Key: 'key3', Value: 'value3' }],
                    },
                ],
            }
            eventArray.push(metricEvent)
            const data = toMetricData(eventArray)
            assert.strictEqual(data.length, 1)
        })

        it('maps TelemetryEvent with data to a multiple MetricDatum', () => {
            const eventArray: TelemetryEvent[] = []
            const createTime = new Date().getTime()
            const metricEvent = {
                data: [
                    {
                        MetricName: 'namespace_event1',
                        Unit: 'None',
                        EpochTimestamp: createTime,
                        Value: 1,
                    },
                    {
                        MetricName: 'namespace_event2',
                        Value: 0.5,
                        EpochTimestamp: createTime,
                        Unit: 'Percent',
                        Metadata: [
                            { Key: 'key', Value: 'value' },
                            { Key: 'key2', Value: 'value2' },
                        ],
                    },
                    {
                        MetricName: 'namespace_event3',
                        Unit: 'Percent',
                        EpochTimestamp: createTime,
                        Value: 0.333,
                        Metadata: [{ Key: 'key3', Value: 'value3' }],
                    },
                ],
            }
            eventArray.push(metricEvent)
            const data = toMetricData(eventArray)

            assert.strictEqual(data.length, 3)
            assert.strictEqual(data[0].EpochTimestamp, createTime)
            assert.strictEqual(data[1].EpochTimestamp, createTime)
            assert.strictEqual(data[2].EpochTimestamp, createTime)
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

            const expectedMetadata1 = [
                { Key: 'key', Value: 'value' },
                { Key: 'key2', Value: 'value2' },
            ]
            const expectedMetadata2 = [{ Key: 'key3', Value: 'value3' }]

            assert.deepStrictEqual(data[1].Metadata, expectedMetadata1)
            assert.deepStrictEqual(data[2].Metadata, expectedMetadata2)
        })
    })
})
