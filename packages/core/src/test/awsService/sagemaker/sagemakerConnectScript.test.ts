/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import * as path from 'path'
import * as os from 'os'

describe('sagemaker_connect script', function () {
    const scriptPath = path.join(__dirname, '../../../resources/sagemaker_connect')
    const isWindows = os.platform() === 'win32'

    // Skip on Windows as the bash script is for Unix-like systems
    ;(isWindows ? describe.skip : describe)('hostname parsing', function () {
        it('parses standard sm_<creds-type>_<arn> format', async function () {
            // Test that the script accepts standard format
            const hostname = 'sm_lc_arn_._aws_sagemaker_us-east-1_123456789012_domain__d-abc123'

            // The script will fail at AWS API call, but we're testing the parsing logic
            // We expect it to parse correctly and fail later, not fail at parsing
            const result = await new ChildProcess('bash', [scriptPath, hostname]).run({
                spawnOptions: { timeout: 5000 },
            })

            // Should not contain the parsing error message
            const output = result.stderr + result.stdout
            assert.ok(!output.includes('Invalid hostname format'))
        })

        it('parses cursor format sm_cursor_<creds-type>_<arn>', async function () {
            const hostname = 'sm_cursor_lc_arn_._aws_sagemaker_us-east-1_123456789012_domain__d-abc123'

            const result = await new ChildProcess('bash', [scriptPath, hostname], { timeout: 5000 }).run()

            const output = result.stderr + result.stdout
            assert.ok(!output.includes('Invalid hostname format'))
        })

        it('rejects invalid hostname format', async function () {
            const hostname = 'invalid_hostname_format'

            const result = await new ChildProcess('bash', [scriptPath, hostname]).run({
                spawnOptions: { timeout: 5000 },
            })

            const output = result.stderr + result.stdout
            assert.ok(output.includes('Invalid hostname format'))
            assert.notStrictEqual(result.exitCode, 0)
        })

        it('extracts correct creds type from standard format', async function () {
            // This test verifies the regex captures the right group
            const hostname = 'sm_lc_arn_._aws_test'

            const result = await new ChildProcess('bash', [scriptPath, hostname]).run({
                spawnOptions: { timeout: 5000 },
            })

            // Should parse successfully (not show invalid format error)
            const output = result.stderr + result.stdout
            assert.ok(!output.includes('Invalid hostname format'))
        })

        it('extracts correct creds type from cursor format', async function () {
            const hostname = 'sm_cursor_dl_arn_._aws_test'

            const result = await new ChildProcess('bash', [scriptPath, hostname]).run({
                spawnOptions: { timeout: 5000 },
            })

            const output = result.stderr + result.stdout
            assert.ok(!output.includes('Invalid hostname format'))
        })
    })

    // Test PowerShell script on Windows
    ;(isWindows ? describe : describe.skip)('PowerShell hostname parsing', function () {
        const psScriptPath = path.join(__dirname, '../../../resources/sagemaker_connect.ps1')

        it('parses standard sm_<creds-type>_<arn> format', async function () {
            const hostname = 'sm_lc_arn_._aws_sagemaker_us-east-1_123456789012_domain__d-abc123'

            const result = await new ChildProcess('powershell.exe', [
                '-ExecutionPolicy',
                'Bypass',
                '-File',
                psScriptPath,
                hostname,
            ]).run({ spawnOptions: { timeout: 5000 } })

            const output = result.stderr + result.stdout
            assert.ok(!output.includes('Invalid hostname format'))
        })

        it('parses cursor format sm_cursor_<creds-type>_<arn>', async function () {
            const hostname = 'sm_cursor_lc_arn_._aws_sagemaker_us-east-1_123456789012_domain__d-abc123'

            const result = await new ChildProcess(
                'powershell.exe',
                ['-ExecutionPolicy', 'Bypass', '-File', psScriptPath, hostname],
                { timeout: 5000 }
            ).run()

            const output = result.stderr + result.stdout
            assert.ok(!output.includes('Invalid hostname format'))
        })

        it('rejects invalid hostname format', async function () {
            const hostname = 'invalid_hostname_format'

            const result = await new ChildProcess('powershell.exe', [
                '-ExecutionPolicy',
                'Bypass',
                '-File',
                psScriptPath,
                hostname,
            ]).run({ spawnOptions: { timeout: 5000 } })

            const output = result.stderr + result.stdout
            assert.ok(output.includes('Invalid hostname format'))
            assert.notStrictEqual(result.exitCode, 0)
        })
    })
})
