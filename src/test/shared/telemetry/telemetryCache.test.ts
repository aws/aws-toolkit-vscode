/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { filterTelemetryCacheEvents } from '../../../shared/telemetry/telemetryService'

describe('Telemetry cache', function () {
    it('Rejects bad data', function () {
        const input = "THis isn't even valid json"

        const output = filterTelemetryCacheEvents(input)
        assert.strictEqual(output.length, 0)
    })

    it('Filters out old data', function () {
        const input = JSON.parse(
            '[{"namespace":"session","createTime":"2020-01-07T22:24:13.356Z","data":[{"name":"end","value":4226661,"unit":"Milliseconds","metadata":{}}]}]'
        )

        const output = filterTelemetryCacheEvents(input)
        assert.strictEqual(output.length, 0)
    })

    it('Extracts good data when there is bad data present', function () {
        const input = JSON.parse(
            `["this is a string", 
            {"namespace":"session","data":[{"name":"end","value":4226661,"unit":"Milliseconds","metadata":{}}]},
            {"MetricName":"session_end","Value":18709,"Unit":"None","EpochTimestamp": "2324324", "Metadata":[{"Key":"awsAccount","Value":"n/a"}]}]`
        )

        const output = filterTelemetryCacheEvents(input)
        assert.strictEqual(output.length, 1)
    })

    it('Extracts good data when there is old data missing EpochTimestamp present', function () {
        const input = JSON.parse(
            `[
                {"createTime":"2020-02-07T16:54:58.293Z", "data":[{"MetricName":"session_end","Value":18709,"Unit":"None", "Metadata":[{"Key":"awsAccount","Value":"n/a"}]}]},
                {"data":[{"MetricName":"session_end","Value":18709,"Unit":"None","EpochTimestamp": "2324324", "Metadata":[{"Key":"awsAccount","Value":"n/a"}]}]},
                {"MetricName":"session_end","Value":18709,"Unit":"None","EpochTimestamp": "2324324", "Metadata":[{"Key":"awsAccount","Value":"n/a"}]}
            ]`
        )

        const output = filterTelemetryCacheEvents(input)
        assert.strictEqual(output.length, 1)
    })

    it('Happy path with passive', function () {
        const input = JSON.parse(
            '[{"MetricName":"session_end","Value":18709,"Unit":"None", "Passive": true, "EpochTimestamp": "2324324","Metadata":[{"Key":"awsAccount","Value":"n/a"}]}]'
        )
        const output = filterTelemetryCacheEvents(input)
        assert.strictEqual(output.length, 1)
    })

    it('Happy path', function () {
        const input = JSON.parse(
            '[{"MetricName":"session_end","Value":18709,"Unit":"None", "EpochTimestamp": "2324324","Metadata":[{"Key":"awsAccount","Value":"n/a"}]}]'
        )
        const output = filterTelemetryCacheEvents(input)
        assert.strictEqual(output.length, 1)
    })
})
