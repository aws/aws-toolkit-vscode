/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { getServiceEnvVarConfig } from '../../../shared/vscode/env'

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
        const configToEnvMap = {
            region: '__CODECATALYST_REGION',
            endpoint: '__CODECATALYST_ENDPOINT',
        }
        addEnvVar('__CODECATALYST_ENDPOINT', 'test.endpoint')

        const expectedConfig = {
            endpoint: 'test.endpoint',
        }
        assert.deepStrictEqual(getServiceEnvVarConfig(service, configToEnvMap), expectedConfig)
    })
})
