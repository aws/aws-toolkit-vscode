/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { resetCodeWhispererGlobalVariables } from '../testUtil'
import { runtimeLanguageContext, RuntimeLanguageContext } from '../../../codewhisperer/util/runtimeLanguageContext'
import * as codewhispererClient from '../../../codewhisperer/client/codewhispererclient'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'

describe('runtimeLanguageContext', function () {
    const languageContext = new RuntimeLanguageContext()

    describe('test isLanguageSupported', function () {
        const cases: string[] = [...CodeWhispererConstants.supportedLanguages, 'cpp', 'kotlin', 'ruby', 'plaintext']

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
        })

        cases.forEach(languageId => {
            const expected = languageContext.isLanguageSupported(languageId)
            it(`should ${expected ? '' : 'not'} support ${languageId}`, function () {
                const language: codewhispererClient.ProgrammingLanguage = { languageName: languageId }
                const actual = languageContext.isLanguageSupported(language.languageName)
                assert.strictEqual(actual, expected)
            })
        })
    })

    describe('test getLanguageContext', function () {
        const cases = [
            ['java', 'java'],
            ['python', 'python'],
            ['javascript', 'javascript'],
            ['typescript', 'javascript'],
            ['javascriptreact', 'jsx'],
            ['plaintext', 'plaintext'],
            ['ruby', 'plaintext'],
            ['cpp', 'plaintext'],
            ['c', 'plaintext'],
            [undefined, 'plaintext'],
        ]

        cases.forEach(tuple => {
            const vscLanguageId = tuple[0]
            const expectedCwsprLanguageId = tuple[1]
            it(`given vscLanguage ${vscLanguageId} should return ${expectedCwsprLanguageId}`, function () {
                const result = runtimeLanguageContext.getLanguageContext(vscLanguageId)
                assert.strictEqual(result.language as string, expectedCwsprLanguageId)
            })
        })
    })

    describe('mapVscLanguageToCodeWhispererLanguage', function () {
        const cases = [
            [undefined, undefined],
            ['typescript', 'javascript'],
            ['javascriptreact', 'jsx'],
            ['go', undefined],
            ['java', 'java'],
            ['javascript', 'javascript'],
            ['python', 'python'],
            ['c', undefined],
            ['cpp', undefined],
        ]

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
        })

        for (const [languageId, expected] of cases) {
            it(`should return ${expected} if languageId is ${languageId}`, function () {
                const actual = languageContext.mapVscLanguageToCodeWhispererLanguage(languageId)
                assert.strictEqual(actual, expected)
            })
        }
    })

    // for now we will only have typescript, jsx mapped to javascript, all other language should remain the same
    describe('test covertCwsprRequest', function () {
        const leftFileContent = 'left'
        const rightFileContent = 'right'
        const filename = 'test'
        const java = 'java'
        const python = 'python'
        const javascript = 'javascript'
        const typescript = 'typescript'

        // use javascriptreact here because it's jsx's VSC languageId
        const jsx = 'javascriptreact'
        const plaintext = 'plaintext'
        const cases: [originalLanguage: string, mappedLanguage: string][] = [
            [java, java],
            [python, python],
            [javascript, javascript],
            [jsx, javascript],
            [typescript, javascript],
            [plaintext, plaintext],
            ['arbitrary string', 'arbitrary string'],
        ]

        this.beforeEach(function () {
            resetCodeWhispererGlobalVariables()
        })

        for (const [originalLanguage, mappedLanguage] of cases) {
            it(`convert ListRecommendationRequest - ${originalLanguage} should map to ${mappedLanguage}`, function () {
                const originalRequest: codewhispererClient.ListRecommendationsRequest = {
                    fileContext: {
                        leftFileContent: leftFileContent,
                        rightFileContent: rightFileContent,
                        filename: filename,
                        programmingLanguage: { languageName: originalLanguage },
                    },
                    maxResults: 1,
                    nextToken: 'token',
                }
                const actual = languageContext.mapToRuntimeLanguage(originalRequest)
                const expected: codewhispererClient.ListRecommendationsRequest = {
                    ...originalRequest,
                    fileContext: {
                        ...originalRequest.fileContext,
                        programmingLanguage: { languageName: mappedLanguage },
                    },
                }
                assert.deepStrictEqual(actual, expected)
            })

            it(`convert GenerateRecommendationsRequest - ${originalLanguage} should map to ${mappedLanguage}`, function () {
                const originalRequest: codewhispererClient.GenerateRecommendationsRequest = {
                    fileContext: {
                        leftFileContent: leftFileContent,
                        rightFileContent: rightFileContent,
                        filename: filename,
                        programmingLanguage: { languageName: originalLanguage },
                    },
                    maxResults: 1,
                }
                const actual = languageContext.mapToRuntimeLanguage(originalRequest)
                const expected: codewhispererClient.GenerateRecommendationsRequest = {
                    ...originalRequest,
                    fileContext: {
                        ...originalRequest.fileContext,
                        programmingLanguage: { languageName: mappedLanguage },
                    },
                }
                assert.deepStrictEqual(actual, expected)
            })
        }
    })
})
