/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import NoOnlyInTests from './lib/rules/no-only-in-tests'
import NoAwaitOnVscodeMsg from './lib/rules/no-await-on-vscode-msg'
import NoIncorrectOnceUsage from './lib/rules/no-incorrect-once-usage'
import NoStringExecForChildProcess from './lib/rules/no-string-exec-for-child-process'

const rules = {
    'no-only-in-tests': NoOnlyInTests,
    'no-await-on-vscode-msg': NoAwaitOnVscodeMsg,
    'no-incorrect-once-usage': NoIncorrectOnceUsage,
    'no-string-exec-for-child-process': NoStringExecForChildProcess,
}

export { rules }
