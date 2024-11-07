/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { rules } from '../../index'
import { formErrorMsg } from '../../lib/rules/no-printf-mismatch'
import { getRuleTester } from '../testUtil'

getRuleTester().run('no-string-sub-mismatch', rules['no-string-sub-mismatch'], {
    valid: [
        'getLogger().debug("this is a string %s and a number %d", "s", 2)',
        'getLogger().debug("this is a number %d", 2)',
        'getLogger().debug("this has no substitutions")',
        'getLogger().debug("1 %s 2 %d 3 %O 4 %o 5 %s", arg1, arg2, arg3, arg4, arg5)',
        'getLogger().debug("not real a sub-token %z")',
    ],
    invalid: [
        {
            code: 'getLogger().debug("this is a string %s and a number %d", "s")',
            errors: [formErrorMsg(2, 1)],
        },
        {
            code: 'getLogger().debug("this is a string %s a string %s a string %s")',
            errors: [formErrorMsg(3, 0)],
        },
        {
            code: 'getLogger().debug("this is a string", err)',
            errors: [formErrorMsg(0, 1)],
        },
    ],
})
