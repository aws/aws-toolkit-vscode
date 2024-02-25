/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { getEnvVars, getServiceEnvVarConfig } from '../../../shared/vscode/env'

describe('env', function () {
    describe('getServiceEnvVarConfig', function () {
        const envVars: string[] = []

        afterEach(() => {
            envVars.forEach(v => delete process.env[v])
            envVars.length = 0
        })

        function addEnvVar(k: string, v: string) {
            process.env[k] = v
            envVars.push(k)
        }

        it('gets service config', async function () {
            const service = 'codecatalyst'
            const serviceConfigs = ['region', 'endpoint', 'gitHostname']
            addEnvVar('__CODECATALYST_ENDPOINT', 'test.endpoint')
            addEnvVar('__CODECATALYST_GIT_HOSTNAME', 'test.gitHostname')

            const expectedConfig = {
                endpoint: 'test.endpoint',
                gitHostname: 'test.gitHostname',
            }
            assert.deepStrictEqual(getServiceEnvVarConfig(service, serviceConfigs), expectedConfig)
        })
    })

    describe('getEnvVars', function () {
        it('gets codecatalyst environment variables', async function () {
            const expectedEnvVars = {
                region: '__CODECATALYST_REGION',
                endpoint: '__CODECATALYST_ENDPOINT',
                hostname: '__CODECATALYST_HOSTNAME',
                gitHostname: '__CODECATALYST_GIT_HOSTNAME',
            }

            const envVar = getEnvVars('codecatalyst', Object.keys(expectedEnvVars))
            assert.deepStrictEqual(envVar, expectedEnvVars)
        })

        it('gets codewhisperer environment variables', async function () {
            const expectedEnvVars = {
                region: '__CODEWHISPERER_REGION',
                endpoint: '__CODEWHISPERER_ENDPOINT',
            }
            const envVar = getEnvVars('codewhisperer', Object.keys(expectedEnvVars))
            assert.deepStrictEqual(envVar, expectedEnvVars)
        })
    })
})
