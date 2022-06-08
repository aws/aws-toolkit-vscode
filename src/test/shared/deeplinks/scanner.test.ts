/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import { ArnScanner } from '../../../shared/deeplinks/scanner'

// With modern tools, ARNs don't appear in hand-written files that frequently.
// They're usually encountered as output from tooling. The credentials `config`
// file is one place where IAM roles commonly show up.
//
// CFN templates also commonly contain ARNs, but they tend to show up as templated
// patterns instead of absolute values. Which we have no good way of resolving.

const sampleConfig = `
[profile admin]
region = us-west-2
role_arn = arn:aws:iam::1234567890:role/Admin
source_profile = base
role_session_name = admin

[profile read-only]
region = us-west-2
role_arn = arn:aws:iam::1234567890:role/ReadOnly
source_profile = base
role_session_name = read-only
`

describe('ArnScanner', function () {
    // This isn't exactly what the Console uses but it's good enough for a test
    const baseUrl = 'https://console.aws.amazon.com/iamv2/home'
    const getDocument = () => vscode.workspace.openTextDocument({ content: sampleConfig })

    it('provides links for ARNs', async function () {
        const document = await getDocument()
        const tokenSource = new vscode.CancellationTokenSource()
        const scanner = new ArnScanner(arn => vscode.Uri.parse(`${baseUrl}#${arn.resource}`))
        const links = scanner.provideDocumentLinks(document, tokenSource.token)

        assert.strictEqual(links.length, 2)
        assert.strictEqual(links[0].target?.toString(true), `${baseUrl}#role/Admin`)
        assert.strictEqual(links[1].target?.toString(true), `${baseUrl}#role/ReadOnly`)
        assert.deepStrictEqual(links[0].range, new vscode.Range(3, 11, 3, 45))
        assert.deepStrictEqual(links[1].range, new vscode.Range(9, 11, 9, 48))
    })

    it('does not provide links if given a cancelled token', async function () {
        const document = await getDocument()
        const tokenSource = new vscode.CancellationTokenSource()
        tokenSource.cancel()

        const scanner = new ArnScanner(() => {
            throw new Error('No links should be provided')
        })
        const links = scanner.provideDocumentLinks(document, tokenSource.token)

        assert.strictEqual(links.length, 0)
    })

    // This test currently covers an impossible scenario as `provideDocumentLinks` is not async
    // There is no way for the VS Code API to cancel the token as the event loop is never ran
    it('stops providing links if cancelled while parsing', async function () {
        const document = await getDocument()
        const tokenSource = new vscode.CancellationTokenSource()

        const scanner = new ArnScanner(arn => {
            tokenSource.cancel()
            return vscode.Uri.parse(`${baseUrl}#${arn.resource}`)
        })

        const links = scanner.provideDocumentLinks(document, tokenSource.token)

        assert.strictEqual(links.length, 1)
        assert.strictEqual(links[0].target?.toString(true), `${baseUrl}#role/Admin`)
    })
})
