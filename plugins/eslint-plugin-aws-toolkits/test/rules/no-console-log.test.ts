/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { rules } from '../../index'
import { errMsg } from '../../lib/rules/no-console-log'
import { getRuleTester } from '../testUtil'

getRuleTester().run('no-console-log', rules['no-console-log'], {
    valid: [
        {
            code: "getLogger().warn('my message')",
            filename: '/src/client.ts',
        },
        {
            code: "console.log('hi')",
            filename: '/scripts/build.ts',
        },
        {
            code: "console.log('hi')",
            filename: '/src/test/client.test.ts',
        },
    ],
    invalid: [
        {
            code: "console.log('test')",
            filename: '/src/client.ts',
            errors: [errMsg],
        },
        {
            code: "console.warn('test')",
            filename: '/src/client.ts',
            errors: [errMsg],
        },
        {
            code: "console.error('test')",
            filename: '/src/client.ts',
            errors: [errMsg],
        },
        {
            code: "console.debug('test')",
            filename: '/src/client.ts',
            errors: [errMsg],
        },
        {
            code: "console.info('test')",
            filename: '/src/client.ts',
            errors: [errMsg],
        },
    ],
})
