/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { TelemetryEventArray } from '../../../shared/telemetry/telemetryEvent'

describe('TelemetryEventArray', () => {
    describe('toMetricData', () => {
        it('maps TelemetryEvent with no data to a single MetricDatum', () => {
            const eventArray = new TelemetryEventArray()
            const metricEvent = {
                namespace: 'namespace',
                createTime: new Date()
            }
            eventArray.push(metricEvent)
            const data = eventArray.toMetricData()

            assert.strictEqual(data.length, 1)
            assert.strictEqual(data[0].EpochTimestamp, metricEvent.createTime.getTime())
            assert.strictEqual(data[0].MetricName, metricEvent.namespace)
            assert.strictEqual(data[0].Metadata, undefined)
        })

        it('maps TelemetryEvent with data to a multiple MetricDatum', () => {
            const eventArray = new TelemetryEventArray()
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
                        metadata: new Map([
                            ['key', 'value'],
                            ['key2', 'value2']
                        ])
                    }
                ]
            }
            eventArray.push(metricEvent)
            const data = eventArray.toMetricData()

            assert.strictEqual(data.length, 2)
            assert.strictEqual(data[0].EpochTimestamp, metricEvent.createTime.getTime())
            assert.strictEqual(data[1].EpochTimestamp, metricEvent.createTime.getTime())
            assert.strictEqual(data[0].MetricName, 'namespace.event1')
            assert.strictEqual(data[1].MetricName, 'namespace.event2')
            assert.strictEqual(data[0].Value, 1)
            assert.strictEqual(data[1].Value, 0.5)
            assert.strictEqual(data[0].Unit, 'None')
            assert.strictEqual(data[1].Unit, 'Percent')
            assert.strictEqual(data[0].Metadata, undefined)

            const expectedMetadata = [
                { Key: 'key', Value: 'value' },
                { Key: 'key2', Value: 'value2' }
            ]

            assert.deepStrictEqual(data[1].Metadata, expectedMetadata)
        })
    })
})
