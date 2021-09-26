/* eslint-disable header/header */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { randomBytes } from 'crypto'

describe('cdk.json JSON schema validation', () => {
    const cdkDocs = new Map<string, Record<string, unknown>>()
    const provider = vscode.workspace.registerTextDocumentContentProvider(
        'cdkjson',
        new (class implements vscode.TextDocumentContentProvider {
            provideTextDocumentContent(uri: vscode.Uri): string {
                return JSON.stringify(cdkDocs.get(uri.authority))
            }
        })()
    )
    async function lintCdkJson(content: Record<string, unknown>) {
        const key = randomBytes(10).toString('hex')
        cdkDocs.set(key, content)
        const docUri = vscode.Uri.parse(`cdkjson://${key}/cdk.json`)
        await Promise.all([
            new Promise(resolve => vscode.languages.onDidChangeDiagnostics(resolve)),
            vscode.workspace.openTextDocument(docUri),
        ])
        return vscode.languages.getDiagnostics(docUri)
    }

    after(async function () {
        await provider.dispose()
    })

    it('should trigger diagnostic messages on invalid cdk.json', async () => {
        const invalidCdkJson = {
            context: {
                'aws:some-prop': 'aws prefixed context is banned',
                'default-account': 'banned property',
                'default-region': 'banned property',
            },
            requireApproval: 'wrong-enum-property', // non-enum string value
            trust: ['1111111', '1111111'], // duplicated array items
        }
        const diagnostics = await lintCdkJson(invalidCdkJson)
        assert.strictEqual(diagnostics.length, 5, `Expected 5 error messages, but got ${diagnostics.length}`)
        const messages = diagnostics.map(d => d.message).sort()
        assert.deepStrictEqual(
            messages,
            [
                'Property aws:some-prop is not allowed.',
                'Property default-account is not allowed.',
                'Property default-region is not allowed.',
                'Value is not accepted. Valid values: "never", "any-change", "broadening".',
                'Array has duplicate items.',
            ].sort()
        )
    })

    it('should not trigged diagnostics on a valid cdk.json', async () => {
        const validCdkJson = {
            app: 'node cdk/app.js',
            prvt: {
                field: 'some extensions to top level fields',
            },
            context: {
                someKey: true,
            },
            roleArn: 'arn:aws:iam::123456789012:role/application_abc/component_xyz/RDSAccess',
        }
        const diagnostics = await lintCdkJson(validCdkJson)
        assert.deepStrictEqual(
            diagnostics.map(d => d.message),
            []
        )
    })
})
