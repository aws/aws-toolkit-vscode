/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { getDiagnosticsType, getDiagnosticsDifferences } from 'aws-core-vscode/codewhisperer'
describe('diagnosticsUtil', function () {
    describe('getDiagnosticsType', function () {
        it('should identify SYNTAX_ERROR correctly', function () {
            assert.strictEqual(getDiagnosticsType('Expected semicolon'), 'SYNTAX_ERROR')
            assert.strictEqual(getDiagnosticsType('Incorrect indent level'), 'SYNTAX_ERROR')
            assert.strictEqual(getDiagnosticsType('Syntax error in line 5'), 'SYNTAX_ERROR')
        })

        it('should identify TYPE_ERROR correctly', function () {
            assert.strictEqual(getDiagnosticsType('Type mismatch'), 'TYPE_ERROR')
            assert.strictEqual(getDiagnosticsType('Invalid type cast'), 'TYPE_ERROR')
        })

        it('should identify REFERENCE_ERROR correctly', function () {
            assert.strictEqual(getDiagnosticsType('Variable is undefined'), 'REFERENCE_ERROR')
            assert.strictEqual(getDiagnosticsType('Variable not defined'), 'REFERENCE_ERROR')
            assert.strictEqual(getDiagnosticsType('Reference error occurred'), 'REFERENCE_ERROR')
        })

        it('should identify BEST_PRACTICE correctly', function () {
            assert.strictEqual(getDiagnosticsType('Using deprecated method'), 'BEST_PRACTICE')
            assert.strictEqual(getDiagnosticsType('Variable is unused'), 'BEST_PRACTICE')
            assert.strictEqual(getDiagnosticsType('Variable not initialized'), 'BEST_PRACTICE')
        })

        it('should identify SECURITY correctly', function () {
            assert.strictEqual(getDiagnosticsType('Potential security vulnerability'), 'SECURITY')
            assert.strictEqual(getDiagnosticsType('Security risk detected'), 'SECURITY')
        })

        it('should return OTHER for unrecognized messages', function () {
            assert.strictEqual(getDiagnosticsType('Random message'), 'OTHER')
            assert.strictEqual(getDiagnosticsType(''), 'OTHER')
        })
    })

    describe('getDiagnosticsDifferences', function () {
        const createDiagnostic = (message: string): vscode.Diagnostic => {
            return {
                message,
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(0, 0, 0, 1),
                source: 'test',
            }
        }

        it('should return empty arrays when both inputs are undefined', function () {
            const result = getDiagnosticsDifferences(undefined, undefined)
            assert.deepStrictEqual(result, { added: [], removed: [] })
        })

        it('should return empty arrays when filepaths are different', function () {
            const oldDiagnostics = {
                filepath: '/path/to/file1',
                diagnostics: [createDiagnostic('error1')],
            }
            const newDiagnostics = {
                filepath: '/path/to/file2',
                diagnostics: [createDiagnostic('error1')],
            }
            const result = getDiagnosticsDifferences(oldDiagnostics, newDiagnostics)
            assert.deepStrictEqual(result, { added: [], removed: [] })
        })

        it('should correctly identify added and removed diagnostics', function () {
            const diagnostic1 = createDiagnostic('error1')
            const diagnostic2 = createDiagnostic('error2')
            const diagnostic3 = createDiagnostic('error3')

            const oldDiagnostics = {
                filepath: '/path/to/file',
                diagnostics: [diagnostic1, diagnostic2],
            }
            const newDiagnostics = {
                filepath: '/path/to/file',
                diagnostics: [diagnostic2, diagnostic3],
            }

            const result = getDiagnosticsDifferences(oldDiagnostics, newDiagnostics)
            assert.deepStrictEqual(result.added, [diagnostic3])
            assert.deepStrictEqual(result.removed, [diagnostic1])
        })
    })
})
