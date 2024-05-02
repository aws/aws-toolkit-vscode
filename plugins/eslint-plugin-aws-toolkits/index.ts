/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import NoOnlyInTests from './lib/rules/no-only-in-tests'
import NoAwaitOnVscodeMsg from './lib/rules/no-await-on-vscode-msg'

const rules = {
    'no-only-in-tests': NoOnlyInTests,
    'no-await-on-vscode-msg': NoAwaitOnVscodeMsg,
}

export { rules }
