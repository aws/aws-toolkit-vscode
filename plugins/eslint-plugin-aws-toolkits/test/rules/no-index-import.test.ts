/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { rules } from '../../index'
import { errMsg } from '../../lib/rules/no-index-import'
import { getRuleTester } from '../testUtil'

// Linted files need `packages/core/src` in their filepaths for them to pass, but we are referencing test resource files
// from this project directory. So, "inject" the expected substring into this filepath.
const verboseFilePath = `${__dirname.replace('dist/', '')}/../../../../packages/core/src/../../../plugins/eslint-plugin-aws-toolkits/test/rules/${path.basename(__filename.replace('.js', '.ts'))}`

getRuleTester().run('no-index-import', rules['no-index-import'], {
    valid: [
        {
            code: "import { doNothing } from '../resources/noIndexImports/utils'",
            filename: verboseFilePath,
        },
        {
            code: "import { doNothing } from '../resources/noIndexImports/utils.ts'",
            filename: verboseFilePath,
        },
        {
            code: "import config from '.eslintrc'",
            filename: 'packages/amazonq/src/test.ts',
        },
        {
            code: "import ts from '@typescript'",
            filename: verboseFilePath,
        },
        {
            code: "import { doNothing } from '../resources/noIndexImports'",
            filename: verboseFilePath.replace('packages/core/src/', 'packages/core/src/test/../'),
        },
        {
            code: "import { doNothing } from '../resources/noIndexImports'",
            filename: verboseFilePath.replace('packages/core/src/', 'packages/core/src/testInteg/../'),
        },
        {
            code: "import { doNothing } from '../resources/noIndexImports/utils'",
            filename: verboseFilePath.replace('packages/core/src/', 'packages/core/src/index/../'),
        },
        {
            code: "import { doNothing } from '../resources/noIndexImports/types.d.ts'",
            filename: verboseFilePath,
        },
        {
            code: "import { doNothing } from '../resources/noIndexImports/types'",
            filename: verboseFilePath,
        },
        {
            code: "import { doNothing } from '../resources/noIndexImports/doesNotExist.json'",
            filename: verboseFilePath,
        },
        {
            code: "import { doNothing } from '../resources/noIndexImports/utils.js'",
            filename: verboseFilePath,
        },
        {
            code: "import { doNothing } from '../resources/noIndexImports/utils.vue'",
            filename: verboseFilePath,
        },
        {
            code: "import { doNothing } from '../resources/nonexistantpath'",
            filename: verboseFilePath,
        },
    ],

    invalid: [
        {
            code: "import { doNothing } from '../resources/noIndexImports'",
            errors: [errMsg],
            filename: verboseFilePath,
        },
        {
            code: "import { doNothing } from '../resources/noIndexImports/'",
            errors: [errMsg],
            filename: verboseFilePath,
        },
        {
            code: "import { doNothing } from '../resources/noIndexImports/index'",
            errors: [errMsg],
            filename: verboseFilePath,
        },
        {
            code: "import { doNothing } from '../resources/noIndexImports/index.ts'",
            errors: [errMsg],
            filename: verboseFilePath,
        },
    ],
})
