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
import noJsonStringifyInLog from './lib/rules/no-json-stringify-in-log'
import noPrintfMismatch from './lib/rules/no-printf-mismatch'
import noIndexImport from './lib/rules/no-index-import'

const rules = {
    'no-await-on-vscode-msg': NoAwaitOnVscodeMsg,
    'no-banned-usages': NoBannedUsages,
    'no-incorrect-once-usage': NoIncorrectOnceUsage,
    'no-only-in-tests': NoOnlyInTests,
    'no-string-exec-for-child-process': NoStringExecForChildProcess,
    'no-console-log': NoConsoleLog,
    'no-json-stringify-in-log': noJsonStringifyInLog,
    'no-printf-mismatch': noPrintfMismatch,
    'no-index-import': noIndexImport,
}

export { rules }
