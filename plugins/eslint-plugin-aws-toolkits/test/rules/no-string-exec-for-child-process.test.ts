/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { rules } from '../../index'
import { errMsg } from '../../lib/rules/no-string-exec-for-child-process'
import { getRuleTester } from '../testUtil'

getRuleTester().run('no-string-exec-for-child-process', rules['no-string-exec-for-child-process'], {
    valid: [
        "import * as proc from 'child_process'; proc.execFile('ls -h')",
        "import * as child_process from 'child_process'; child_process.execFile('ls -h')",
        "import { execFileSync } from 'child_process'; execFile('ls -h')",
    ],
    invalid: [
        {
            code: "import * as proc from 'child_process'; proc.execSync('ls -h');",
            errors: [errMsg],
        },
        {
            code: "import * as child_process from 'child_process'; child_process.exec('ls -h');",
            errors: [errMsg],
        },
        {
            code: "import { execSync } from 'child_process'; execSync('ls -h');",
            errors: [errMsg],
        },
        {
            code: "import { exec } from 'child_process'; exec('ls -h')",
            errors: [errMsg],
        },
        {
            code: "import { exec, execSync } from 'child_process'; execSync('ls -h');",
            errors: [errMsg, errMsg],
        },
    ],
})
