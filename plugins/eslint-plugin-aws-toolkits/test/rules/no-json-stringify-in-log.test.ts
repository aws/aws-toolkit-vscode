/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { rules } from '../../index'
import { errMsg } from '../../lib/rules/no-json-stringify-in-log'
import { getRuleTester } from '../testUtil'

getRuleTester().run('no-json-stringify-in-log', rules['no-json-stringify-in-log'], {
    valid: [
        'getLogger().debug(`the object is %O`)',
        'return JSON.stringify(d)',
        'getLogger().debug(`this does not include anything`)',
        'getLogger().debug(`another example ${JSON.notString(something)}`)',
        'getLogger().fakeFunction(`another example ${JSON.notString(something)}`)',
    ],

    invalid: [
        {
            code: 'getLogger().debug(`the object is ${JSON.stringify(obj)}`)',
            errors: [errMsg],
        },
        {
            code: 'getLogger().debug(`the object is ${notThis} but ${JSON.stringify(obj)}`)',
            errors: [errMsg],
        },
        {
            code: 'getLogger().debug(`the object is ${notThis} or ${thisOne} but ${JSON.stringify(obj)}`)',
            errors: [errMsg],
        },
        {
            code: 'getLogger().verbose(`Invalid Request : `, JSON.stringify(request, undefined, EditorContext.getTabSize()))',
            errors: [errMsg],
        },
        {
            code: 'getLogger().verbose(`provideDebugConfigurations: debugconfigs: ${JSON.stringify(configs)}`)',
            errors: [errMsg],
        },
    ],
})
