/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import NoAwaitOnVscodeMsg from './lib/rules/no-await-on-vscode-msg'
import NoBannedUsages from './lib/rules/no-banned-usages'
import NoIncorrectOnceUsage from './lib/rules/no-incorrect-once-usage'
import NoOnlyInTests from './lib/rules/no-only-in-tests'
import NoStringExecForChildProcess from './lib/rules/no-string-exec-for-child-process'
import NoConsoleLog from './lib/rules/no-console-log'

const rules = {
    'no-await-on-vscode-msg': NoAwaitOnVscodeMsg,
    'no-banned-usages': NoBannedUsages,
    'no-incorrect-once-usage': NoIncorrectOnceUsage,
    'no-only-in-tests': NoOnlyInTests,
    'no-string-exec-for-child-process': NoStringExecForChildProcess,
    'no-console-log': NoConsoleLog,
}

export { rules }
