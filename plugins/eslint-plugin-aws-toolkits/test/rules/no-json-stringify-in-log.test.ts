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
        'this.deps.devLogger?.debug("crashMonitoring: CLEAR_STATE: Succeeded")',
        'getLogger().debug(`called startBuilderIdSetup()`)',
        'this.logger.exit(`${JSON.stringify(obj)}`)',
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
        {
            code: 'devLogger?.debug(`crashMonitoring: CHECKED: Result of cleaning up crashed instances\nBEFORE: ${JSON.stringify(before)}\nAFTER:  ${JSON.stringify(after)}\nACTUAL: ${JSON.stringify(afterActual)}`)',
            errors: [errMsg],
        },
        {
            code: 'getLogger().warn(`skipping invalid item in telemetry cache: ${JSON.stringify(item)}\n`)',
            errors: [errMsg],
        },
        {
            code: 'this.deps.devLogger?.debug(`crashMonitoring: CLEAR_STATE: Succeeded ${JSON.stringify(item)}`)',
            errors: [errMsg],
        },
    ],
})
