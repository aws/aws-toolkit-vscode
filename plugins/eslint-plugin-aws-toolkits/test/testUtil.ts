/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RuleTester } from 'eslint'

export function getRuleTester() {
    return new RuleTester({
        // TODO: For tests that need to access TS types, we will need to pass a parser:
        // parser: require.resolve('@typescript-eslint/parser'),
        parserOptions: {
            project: './tsconfig.json',
            tsconfigRootDir: __dirname,
            ecmaVersion: 2021,
        },
    })
}
