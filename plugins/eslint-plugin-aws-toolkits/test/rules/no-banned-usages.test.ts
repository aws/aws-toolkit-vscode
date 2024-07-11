/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { rules } from '../../index'
import { errMsgs } from '../../lib/rules/no-banned-usages'
import { getRuleTester } from '../testUtil'

getRuleTester().run('no-banned-usages', rules['no-banned-usages'], {
    valid: ["vscode.commands.executeCommand('foo', 'aws.foo', true, 42)"],

    invalid: [
        {
            code: "async function test() { await vscode.commands.executeCommand('setContext', key, val) }",
            errors: [errMsgs.setContext],
        },
        {
            code: "const vsc = vscode; vsc.commands.executeCommand('setContext', key, val)",
            errors: [errMsgs.setContext],
        },
        {
            code: "const vsc = vscode; const cmds = vsc.commands; cmds.executeCommand('setContext', key, val)",
            errors: [errMsgs.setContext],
        },
        {
            code: "vscode.commands.executeCommand('setContext', 'aws.foo', true, 42)",
            errors: [errMsgs.setContext],
        },
        {
            code: "void vscode.commands.executeCommand('setContext', 'aws.foo', true, 42)",
            errors: [errMsgs.setContext],
        },
        {
            code: "const x = vscode.commands.executeCommand('setContext', key, val).catch(e => { return e })",
            errors: [errMsgs.setContext],
        },
    ],
})
