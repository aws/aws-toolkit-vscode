/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { getServiceEnvVarConfig } from '../../../shared/vscode/env'

describe('getServiceEnvVarConfig', function () {
    it('gets service config', async function () {
        const service = 'codecatalyst'
        const configToEnvMap = {
            region: '__CODECATALYST_REGION',
            endpoint: '__CODECATALYST_ENDPOINT',
        }
        process.env['__CODECATALYST_ENDPOINT'] = 'test.endpoint'

        const expectedConfig = {
            endpoint: 'test.endpoint',
        }
        assert.deepStrictEqual(getServiceEnvVarConfig(service, configToEnvMap), expectedConfig)
    })
})
