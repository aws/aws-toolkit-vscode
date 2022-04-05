/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { SemVer } from 'semver'
import { resetConsolasGlobalVariables } from '../testUtil'
import { runtimeLanguageContext } from '../../../../vector/consolas/util/runtimeLanguageContext'
import { LanguageContext } from '../../../../vector/consolas/util/runtimeLanguageContext'

describe('runtimeLanguageContext', function () {
    // let originalSettingValue: any
    // let settings: vscode.WorkspaceConfiguration

    // beforeEach(async function () {
    //     settings = vscode.workspace.getConfiguration('python')
    //     originalSettingValue = settings.get('defaultInterpreterPath')
    // })

    const languageContext = new LanguageContext()
    describe('getRuntimeLanguage', function () {
        const cases: [languageId: string, version: string, expected: string][] = [
            ['python', '3.7.6', 'python3'],
            ['python', '2.7.10', 'python2'],
            ['python', '0.0.1', 'python2'],
            ['javascript', '12.22.9', 'javascript'],
            ['javascript', '0.0.1', 'javascript'],
            ['java', '8.0.311', 'java8'],
            ['java', '11.0.13', 'java11'],
            ['java', '16.0.1', 'java16'],
            ['java', '0.0.1', 'java16'],
        ]
        beforeEach(async function () {
            resetConsolasGlobalVariables()
        })

        for (const [languageId, version, expected] of cases) {
            it(`should return ${expected} if language is ${languageId} and version is ${version}`, function () {
                const actual = languageContext.getRuntimeLanguage(languageId, version)
                assert.strictEqual(actual, expected)
            })
        }
    })

    describe('setLanguageContext', function () {
        beforeEach(async function () {
            resetConsolasGlobalVariables()
        })
        afterEach(async function () {
            sinon.restore()
        })

        it('set python', async function () {
            const fakeConfig: vscode.WorkspaceConfiguration = {
                get: function (section: string): string | undefined {
                    return '~/3.0.0'
                },
                has: sinon.spy(),
                inspect: sinon.spy(),
                update: sinon.spy(),
            }
            await languageContext.initLanguageContext('python', fakeConfig)
            assert.deepStrictEqual(runtimeLanguageContext.languageContexts['python'], {
                language: 'python',
                runtimeLanguage: 'python2',
                runtimeLanguageSource: '2.7.16',
            })
        })

        it('set java', async function () {
            sinon.stub(languageContext, 'getLanguageVersionNumber').resolves(new SemVer('11.0.13'))
            await languageContext.initLanguageContext('java')
            assert.deepStrictEqual(runtimeLanguageContext.languageContexts['java'], {
                language: 'java',
                runtimeLanguage: 'java11',
                runtimeLanguageSource: '11.0.13',
            })
        })

        it('set javascript', async function () {
            sinon.stub(languageContext, 'getLanguageVersionNumber').resolves(new SemVer('12.22.9'))
            await languageContext.initLanguageContext('javascript')
            assert.deepStrictEqual(runtimeLanguageContext.languageContexts['javascript'], {
                language: 'javascript',
                runtimeLanguage: 'javascript',
                runtimeLanguageSource: '12.22.9',
            })
        })
    })
    describe('setLanguageRuntimeContext', function () {
        beforeEach(async function () {
            resetConsolasGlobalVariables()
        })

        afterEach(function () {
            sinon.restore()
        })
    })

    describe('convertLanguage', function () {
        const cases: [languageId: string | undefined, expected: string][] = [
            [undefined, 'plaintext'],
            ['typescript', 'javascript'],
            ['go', 'plaintext'],
            ['java', 'java'],
            ['javascript', 'javascript'],
            ['python', 'python'],
            ['c', 'plaintext'],
            ['COBOL', 'plaintext'],
        ]

        beforeEach(function () {
            resetConsolasGlobalVariables()
        })

        for (const [languageId, expected] of cases) {
            it(`should return ${expected} if languageId is ${languageId}`, function () {
                const actual = languageContext.convertLanguage(languageId)
                assert.strictEqual(actual, expected)
            })
        }
    })
})
