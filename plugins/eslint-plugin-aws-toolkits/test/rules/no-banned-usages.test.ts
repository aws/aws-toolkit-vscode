/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { rules } from '../../index'
import { errMsgs } from '../../lib/rules/no-banned-usages'
import { getRuleTester } from '../testUtil'

getRuleTester().run('no-banned-usages', rules['no-banned-usages'], {
    valid: [
        // setContext
        "vscode.commands.executeCommand('foo', 'aws.foo', true, 42)",
        // globalState
        'globals.globalState',
        'await globals.globalState.update("foo", 42)',
        'globals.globalState.get("foo")',
        'globalState.get("foo")',
    ],

    invalid: [
        //
        // setContext
        //
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

        //
        // globalState
        //
        {
            code: 'const memento = globals.context.globalState',
            errors: [errMsgs.globalState],
        },
        {
            code: 'const val = globals.context.globalState.get("foo")',
            errors: [errMsgs.globalState],
        },
        {
            code: 'const val = extContext.globalState.get("foo")',
            errors: [errMsgs.globalState],
        },
        {
            code: 'return this.openState(targetContext.globalState, key)',
            errors: [errMsgs.globalState],
        },

        // TODO: prevent assignment of GlobalState to Memento.
        // {
        //     code: 'const state: vscode.Memento = globals.globalState',
        //     errors: [errMsgs.globalState],
        // },
    ],
})
