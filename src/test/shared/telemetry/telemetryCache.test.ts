/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import { writeFileSync } from 'fs'
import * as path from 'path'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { DefaultTelemetryService } from '../../../shared/telemetry/defaultTelemetryService'

describe('Telemetry cache', () => {
    let tempFolder: string
    let tempFile: string

    beforeEach(async () => {
        tempFolder = await makeTemporaryToolkitFolder()
        tempFile = path.join(tempFolder, 'telemetry-test-data')
    })
    afterEach(async () => {
        await del([tempFolder], { force: true })
    })

    it('Rejects bad data', () => {
        const input = "THis isn't even valid json"
        writeFileSync(tempFile, input)
        const output = DefaultTelemetryService.readEventsFromCache(tempFile)
        assert.strictEqual(output, [])
    })

    it('Filters out old data', () => {
        const input =
            '[{"namespace":"session","createTime":"2020-01-07T22:24:13.356Z","data":[{"name":"end","value":4226661,"unit":"Milliseconds","metadata":{}}]}]'
        writeFileSync(tempFile, input)
        const output = DefaultTelemetryService.readEventsFromCache(tempFile)
        assert.strictEqual(output, [])
    })

    it('Extracts good data when there is bad data present', () => {
        const input =
            '["this is a string", {"namespace":"session","createTime":"2020-01-07T22:24:13.356Z","data":[{"name":"end","value":4226661,"unit":"Milliseconds","metadata":{}}]},{"createTime":"2020-02-07T16:54:58.293Z","data":[{"MetricName":"session_end","Value":18709,"Unit":"None","Metadata":[{"Key":"awsAccount","Value":"n/a"}]}]}]'
        writeFileSync(tempFile, input)
        const output = DefaultTelemetryService.readEventsFromCache(tempFile)
        assert.strictEqual(output.length, 1)
    })

    it('Happy path', () => {
        const input =
            '[{"createTime":"2020-02-07T16:54:58.293Z","data":[{"MetricName":"session_end","Value":18709,"Unit":"None","Metadata":[{"Key":"awsAccount","Value":"n/a"}]}]}]'
        writeFileSync(tempFile, input)
        const output = DefaultTelemetryService.readEventsFromCache(tempFile)
        assert.strictEqual(output.length, 1)
    })
})
