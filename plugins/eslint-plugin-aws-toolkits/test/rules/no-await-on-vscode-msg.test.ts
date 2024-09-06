/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { rules } from '../../index'
import { errMsg } from '../../lib/rules/no-await-on-vscode-msg'
import { getRuleTester } from '../testUtil'

getRuleTester().run('no-await-on-vscode-msg', rules['no-await-on-vscode-msg'], {
    valid: [
        "vscode.window.showInformationMessage('Hey there!')",
        "vscode.window.showWarningMessage('Hey there!')",
        "vscode.window.showErrorMessage('Hey there!')",

        "void vscode.window.showInformationMessage('Hey there!')",
        "void vscode.window.showWarningMessage('Hey there!')",
        "void vscode.window.showErrorMessage('Hey there!')",

        "async function test() { const response = await vscode.window.showInformationMessage('Hey there!') }",
        "async function test() { const response = await vscode.window.showWarningMessage('Hey there!') }",
        "async function test() { const response = await vscode.window.showErrorMessage('Hey there!') }",

        "showInformationMessage('Hey there!')",
        "showWarningMessage('Hey there!')",
        "showErrorMessage('Hey there!')",

        "vscode.window.showInformationMessage('Hey there!').then(r => console.log(r))",
        "vscode.window.showWarningMessage('Hey there!').then(r => console.log(r))",
        "vscode.window.showErrorMessage('Hey there!').then(r => console.log(r))",

        "async function test() { await vscode.window.showInformationMessage('Hey there!').then(r => console.log(r)) }",
        "async function test() { await vscode.window.showWarningMessage('Hey there!').then(r => console.log(r)) }",
        "async function test() { await vscode.window.showErrorMessage('Hey there!').then(r => console.log(r)) }",

        "async function test() { const resp = isSomething() ? doSomething() : await vscode.window.showInformationMessage('Hey there!')}",
        "async function test() { const resp = isSomething() ? doSomething() : isOtherThing() ? doOtherThing() : await vscode.window.showInformationMessage('Hey there!')}",

        "async function test() { if(await vscode.window.showInformationMessage('Hey there!')) { console.log('ok') } }",
    ],

    invalid: [
        {
            code: "async function test() { await vscode.window.showInformationMessage('Hey there!') }",
            errors: [errMsg],
        },
        {
            code: "async function test() { await vscode.window.showWarningMessage('Hey there!') }",
            errors: [errMsg],
        },
        {
            code: "async function test() { await vscode.window.showErrorMessage('Hey there!') }",
            errors: [errMsg],
        },

        {
            code: "async function test() { isSomething() ? doSomething() : await vscode.window.showInformationMessage('Hey there!')}",
            errors: [errMsg],
        },
        {
            code: "async function test() { isSomething() ? doSomething() : isOtherThing() ? doOtherThing() : await vscode.window.showInformationMessage('Hey there!')}",
            errors: [errMsg],
        },

        // Devs shouldn't use these as function names; we assume them to be referring to vscode.window...
        {
            code: "async function test() { await showInformationMessage('Hey there!') }",
            errors: [errMsg],
        },
        {
            code: "async function test() { await showWarningMessage('Hey there!') }",
            errors: [errMsg],
        },
        {
            code: "async function test() { await showErrorMessage('Hey there!') }",
            errors: [errMsg],
        },
    ],
})
