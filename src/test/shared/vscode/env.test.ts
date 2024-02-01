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
