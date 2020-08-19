/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver'
import { Position, Range } from 'vscode-languageserver'
import { getLanguageService } from '../../../../src/stepFunctions/asl/asl-yaml-languageservice'

import {
    documentChoiceDefaultBeforeChoice,
    documentChoiceInvalidDefault,
    documentChoiceInvalidNext,
    documentChoiceNoDefault,
    documentChoiceValidDefault,
    documentChoiceValidNext,
    documentInvalidNext,
    documentInvalidNextNested,
    documentInvalidParametersIntrinsicFunction,
    documentInvalidParametersJsonPath,
    documentInvalidPropertiesCatch,
    documentInvalidPropertiesChoices,
    documentInvalidPropertiesRoot,
    documentInvalidPropertiesRootNested,
    documentInvalidPropertiesState,
    documentInvalidResultSelectorIntrinsicFunction,
    documentInvalidResultSelectorJsonPath,
    documentMapCatchTemplate,
    documentMapCatchTemplateInvalidNext,
    documentNestedNoTerminalState,
    documentNestedUnreachableState,
    documentNoTerminalState,
    documentParallelCatchTemplate,
    documentParallelCatchTemplateInvalidNext,
    documentStartAtInvalid,
    documentStartAtNestedInvalid,
    documentStartAtValid,
    documentSucceedFailTerminalState,
    documentTaskCatchTemplate,
    documentTaskCatchTemplateInvalidNext,
    documentTaskInvalidArn,
    documentTaskValidVariableSubstitution,
    documentUnreachableState,
    documentValidAslImprovements,
    documentValidNext,
    documentValidParametersIntrinsicFunction,
    documentValidParametersJsonPath,
    documentValidResultSelectorIntrinsicFunction,
    documentValidResultSelectorJsonPath,
} from './yasl-strings/validationStrings'

import { toDocument } from './utils/testUtilities'

const JSON_SCHEMA_MULTIPLE_SCHEMAS_MSG = 'Matches multiple schemas when only one must validate.'

const MESSAGES = {
    INVALID_NEXT: 'The value of "Next" property must be the name of an existing state.',
    INVALID_DEFAULT: 'The value of "Default" property must be the name of an existing state.',
    INVALID_START_AT: 'The value of "StartAt" property must be the name of an existing state.',
    INVALID_JSON_PATH_OR_INTRINSIC:
        'The value for the field must be a valid JSONPath or intrinsic function expression.',
    UNREACHABLE_STATE: 'The state cannot be reached. It must be referenced by at least one other state.',
    NO_TERMINAL_STATE:
        'No terminal state. The state machine must have at least one terminal state (a state in which the "End" property is set to true).',
    INVALID_PROPERTY_NAME: 'Field is not supported.',
    MUTUALLY_EXCLUSIVE_CHOICE_PROPERTIES: 'Each Choice Rule can only have one comparison operator.',
} as const

export interface TestValidationOptions {
    json: string
    diagnostics: {
        message: string
        start: [number, number]
        end: [number, number]
    }[]
    filterMessages?: string[]
}

async function getValidations(json: string) {
    const { textDoc, jsonDoc } = toDocument(json)
    const ls = getLanguageService({})

    return await ls.doValidation(textDoc, jsonDoc)
}

async function testValidations(options: TestValidationOptions) {
    const { json, diagnostics, filterMessages } = options

    let res = await getValidations(json)
    console.log(res)
    res = res.filter(diagnostic => {
        if (filterMessages && filterMessages.find(message => message === diagnostic.message)) {
            return false
        }

        return true
    })

    assert.strictEqual(res.length, diagnostics.length)

    res.forEach((item, index) => {
        const leftPos = Position.create(...diagnostics[index].start)
        const rightPos = Position.create(...diagnostics[index].end)

        const diagnostic = Diagnostic.create(
            Range.create(leftPos, rightPos),
            diagnostics[index].message,
            DiagnosticSeverity.Error
        )

        assert.deepStrictEqual(diagnostic, item)
    })
}

describe('ASL YAML context-aware validation', () => {
    describe('Invalid JSON Input', () => {
        it("Empty string doesn't throw errors", async () => {
            await getValidations('')
        })

        it("[] string doesn't throw type errors", async () => {
            await assert.doesNotReject(getValidations('[]'), TypeError)
        })
    })

    describe('Default of Choice state', () => {
        it('Shows diagnostic for invalid state name', async () => {
            await testValidations({
                json: documentChoiceInvalidDefault,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_DEFAULT,
                        start: [13, 15],
                        end: [13, 33],
                    },
                    {
                        message: MESSAGES.UNREACHABLE_STATE,
                        start: [18, 4],
                        end: [18, 16],
                    },
                ],
            })
        })

        it("Doesn't show Diagnostic for valid state name", async () => {
            await testValidations({
                json: documentChoiceValidDefault,
                diagnostics: [],
            })
        })

        it("Doesn't show Diagnostic when default property is absent", async () => {
            await testValidations({
                json: documentChoiceNoDefault,
                diagnostics: [],
            })
        })

        it("Doesn't show Diagnostic for valid state name when default state is declared before Choice state", async () => {
            await testValidations({
                json: documentChoiceDefaultBeforeChoice,
                diagnostics: [],
            })
        })
    })

    describe('StartAt', () => {
        it("Shows Diagnostic for state name that doesn't exist", async () => {
            await testValidations({
                json: documentStartAtInvalid,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_START_AT,
                        start: [1, 11],
                        end: [1, 16],
                    },
                ],
                filterMessages: [MESSAGES.UNREACHABLE_STATE, MESSAGES.NO_TERMINAL_STATE],
            })
        })

        it("Doesn't show Diagnostic for valid state name", async () => {
            await testValidations({
                json: documentStartAtValid,
                diagnostics: [],
            })
        })

        it("Shows Diagnostic for state name that doesn't exist in nested StartAt property", async () => {
            await testValidations({
                json: documentStartAtNestedInvalid,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_START_AT,
                        start: [7, 19],
                        end: [7, 22],
                    },
                    {
                        message: MESSAGES.INVALID_START_AT,
                        start: [21, 19],
                        end: [21, 23],
                    },
                ],
                filterMessages: [MESSAGES.UNREACHABLE_STATE, MESSAGES.NO_TERMINAL_STATE],
            })
        })
    })

    describe('Next', () => {
        it("Shows Diagnostic for state name that doesn't exist", async () => {
            await testValidations({
                json: documentInvalidNext,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_NEXT,
                        start: [5, 12],
                        end: [5, 16],
                    },
                ],
                filterMessages: [MESSAGES.UNREACHABLE_STATE, MESSAGES.NO_TERMINAL_STATE],
            })
        })

        it("Doesn't show Diagnostic for valid state name", async () => {
            await testValidations({
                json: documentValidNext,
                diagnostics: [],
                filterMessages: [MESSAGES.UNREACHABLE_STATE, MESSAGES.NO_TERMINAL_STATE],
            })
        })

        it("Shows Diagnostic for state name that doesn't exist in nested Next property", async () => {
            await testValidations({
                json: documentInvalidNextNested,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_NEXT,
                        start: [11, 20],
                        end: [11, 31],
                    },
                    {
                        message: MESSAGES.INVALID_NEXT,
                        start: [31, 18],
                        end: [31, 29],
                    },
                ],
                filterMessages: [MESSAGES.UNREACHABLE_STATE, MESSAGES.NO_TERMINAL_STATE],
            })
        })

        it('Validates next property of the Choice state', async () => {
            await testValidations({
                json: documentChoiceInvalidNext,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_NEXT,
                        start: [17, 24],
                        end: [17, 26],
                    },
                ],
                filterMessages: [MESSAGES.UNREACHABLE_STATE, MESSAGES.NO_TERMINAL_STATE],
            })
        })
    })

    describe('Unreachable State', () => {
        it('Shows diagnostic for an unreachable state', async () => {
            await testValidations({
                json: documentUnreachableState,
                diagnostics: [
                    {
                        message: MESSAGES.UNREACHABLE_STATE,
                        start: [3, 4],
                        end: [3, 11],
                    },
                    {
                        message: MESSAGES.UNREACHABLE_STATE,
                        start: [12, 4],
                        end: [12, 14],
                    },
                    {
                        message: MESSAGES.UNREACHABLE_STATE,
                        start: [15, 4],
                        end: [15, 15],
                    },
                ],
                filterMessages: [MESSAGES.NO_TERMINAL_STATE, MESSAGES.INVALID_START_AT],
            })
        })

        it('Shows diagnostic for an unreachable state in nested list of states', async () => {
            await testValidations({
                json: documentNestedUnreachableState,
                diagnostics: [
                    {
                        message: MESSAGES.UNREACHABLE_STATE,
                        start: [12, 12],
                        end: [12, 18],
                    },
                    {
                        message: MESSAGES.UNREACHABLE_STATE,
                        start: [32, 10],
                        end: [32, 16],
                    },
                ],
                filterMessages: [MESSAGES.NO_TERMINAL_STATE],
            })
        })
    })

    describe('Terminal State', () => {
        it('Shows diagnostic for lack of terminal state', async () => {
            await testValidations({
                json: documentNoTerminalState,
                diagnostics: [
                    {
                        message: MESSAGES.NO_TERMINAL_STATE,
                        start: [2, 2],
                        end: [2, 8],
                    },
                ],
            })
        })

        it('Shows diagnostic for lack of terminal state in nested list of states', async () => {
            await testValidations({
                json: documentNestedNoTerminalState,
                diagnostics: [
                    {
                        message: MESSAGES.NO_TERMINAL_STATE,
                        start: [16, 10],
                        end: [16, 16],
                    },
                    {
                        message: MESSAGES.NO_TERMINAL_STATE,
                        start: [28, 8],
                        end: [28, 14],
                    },
                ],
                filterMessages: [MESSAGES.UNREACHABLE_STATE],
            })
        })

        it('Accepts "Succeed" and "Fail" state as terminal states', async () => {
            await testValidations({
                json: documentSucceedFailTerminalState,
                diagnostics: [],
            })
        })

        it('No terminal state error when state referenced from next property of Choice state within Parallel state', async () => {
            await testValidations({
                json: documentChoiceValidNext,
                diagnostics: [],
            })
        })
    })

    describe('Catch property of "Parallel" and "Task" state', async () => {
        it('Does not show diagnostic on valid next property within Catch block of Task state', async () => {
            await testValidations({
                json: documentTaskCatchTemplate,
                diagnostics: [],
            })
        })

        it('Does not show diagnostic on valid next property within Catch block of Parallel state', async () => {
            await testValidations({
                json: documentParallelCatchTemplate,
                diagnostics: [],
            })
        })

        it('Does not show diagnostic on valid next property within Catch block of Map state', async () => {
            await testValidations({
                json: documentMapCatchTemplate,
                diagnostics: [],
            })
        })

        it('Shows diagnostics on invalid next property within Catch block of Task state', async () => {
            await testValidations({
                json: documentTaskCatchTemplateInvalidNext,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_NEXT,
                        start: [13, 18],
                        end: [13, 30],
                    },
                    {
                        message: MESSAGES.INVALID_NEXT,
                        start: [16, 18],
                        end: [16, 34],
                    },
                ],
                filterMessages: [MESSAGES.UNREACHABLE_STATE],
            })
        })

        it('Shows diagnostics on invalid next property within Catch block of Parallel', async () => {
            await testValidations({
                json: documentParallelCatchTemplateInvalidNext,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_NEXT,
                        start: [9, 16],
                        end: [9, 24],
                    },
                ],
                filterMessages: [MESSAGES.UNREACHABLE_STATE],
            })
        })

        it('Shows diagnostics on invalid next property within Catch block of Map', async () => {
            await testValidations({
                json: documentMapCatchTemplateInvalidNext,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_NEXT,
                        start: [19, 16],
                        end: [19, 23],
                    },
                    {
                        message: MESSAGES.INVALID_NEXT,
                        start: [25, 16],
                        end: [25, 24],
                    },
                ],
                filterMessages: [MESSAGES.UNREACHABLE_STATE],
            })
        })
    })

    describe('Additional properties that are not valid', async () => {
        it('Shows diagnostics for additional invalid properties of a given state', async () => {
            await testValidations({
                json: documentInvalidPropertiesState,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_PROPERTY_NAME,
                        start: [7, 6],
                        end: [7, 23],
                    },
                    {
                        message: MESSAGES.INVALID_PROPERTY_NAME,
                        start: [8, 6],
                        end: [8, 23],
                    },
                ],
                filterMessages: [MESSAGES.UNREACHABLE_STATE],
            })
        })

        it('Shows diagnostics for additional invalid properties within Catch block', async () => {
            await testValidations({
                json: documentInvalidPropertiesCatch,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_PROPERTY_NAME,
                        start: [10, 8],
                        end: [10, 18],
                    },
                    {
                        message: MESSAGES.INVALID_PROPERTY_NAME,
                        start: [14, 8],
                        end: [14, 18],
                    },
                    {
                        message: MESSAGES.INVALID_PROPERTY_NAME,
                        start: [15, 8],
                        end: [15, 20],
                    },
                ],
                filterMessages: [MESSAGES.UNREACHABLE_STATE],
            })
        })

        it('Shows diagnostics for additional invalid properties within Choice state', async () => {
            await testValidations({
                json: documentInvalidPropertiesChoices,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_PROPERTY_NAME,
                        start: [15, 8],
                        end: [15, 24],
                    },
                    {
                        message: MESSAGES.MUTUALLY_EXCLUSIVE_CHOICE_PROPERTIES,
                        start: [13, 8],
                        end: [13, 20],
                    },
                    {
                        message: MESSAGES.MUTUALLY_EXCLUSIVE_CHOICE_PROPERTIES,
                        start: [14, 8],
                        end: [14, 32],
                    },
                    {
                        message: MESSAGES.INVALID_PROPERTY_NAME,
                        start: [21, 10],
                        end: [21, 27],
                    },
                    {
                        message: MESSAGES.INVALID_PROPERTY_NAME,
                        start: [22, 10],
                        end: [22, 14],
                    },
                    {
                        message: MESSAGES.INVALID_PROPERTY_NAME,
                        start: [26, 10],
                        end: [26, 26],
                    },
                    {
                        message: MESSAGES.INVALID_PROPERTY_NAME,
                        start: [27, 10],
                        end: [27, 14],
                    },
                    {
                        message: MESSAGES.INVALID_PROPERTY_NAME,
                        start: [32, 8],
                        end: [32, 12],
                    },
                ],
                filterMessages: [MESSAGES.UNREACHABLE_STATE, JSON_SCHEMA_MULTIPLE_SCHEMAS_MSG],
            })
        })

        it('Shows diagnostics for additional invalid properties within root of state machine', async () => {
            await testValidations({
                json: documentInvalidPropertiesRoot,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_PROPERTY_NAME,
                        start: [5, 2],
                        end: [5, 18],
                    },
                ],
            })
        })

        it('Shows diagnostics for additional invalid properties within root of nested state machine', async () => {
            await testValidations({
                json: documentInvalidPropertiesRootNested,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_PROPERTY_NAME,
                        start: [10, 8],
                        end: [10, 19],
                    },
                ],
            })
        })
    })

    describe('Test validation of Resource arn for Task State', async () => {
        it('Does not show diagnostic on invalid arn', async () => {
            await testValidations({
                json: documentTaskInvalidArn,
                diagnostics: [],
            })
        })

        it('Does not show diagnostic on valid variable substitution', async () => {
            await testValidations({
                json: documentTaskValidVariableSubstitution,
                diagnostics: [],
            })
        })
    })

    describe('Test validation of Properties field', async () => {
        it('Does not show diagnostics for valid JSON paths', async () => {
            await testValidations({
                json: documentValidParametersJsonPath,
                diagnostics: [],
            })
        })

        it('Does not show diagnostics for valid Intrinsic Functions', async () => {
            await testValidations({
                json: documentValidParametersIntrinsicFunction,
                diagnostics: [],
            })
        })

        it('Shows diagnostics for invalid JSON paths', async () => {
            await testValidations({
                json: documentInvalidParametersJsonPath,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                        start: [9, 18],
                        end: [9, 18],
                    },
                    {
                        message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                        start: [12, 28],
                        end: [12, 30],
                    },
                    {
                        message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                        start: [13, 28],
                        end: [13, 32],
                    },
                    {
                        message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                        start: [14, 21],
                        end: [14, 28],
                    },
                ],
            })
        })

        it('Shows diagnostics for invalid Intrinsic Functions', async () => {
            await testValidations({
                json: documentInvalidParametersIntrinsicFunction,
                diagnostics: [
                    {
                        message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                        start: [9, 20],
                        end: [9, 72],
                    },
                    {
                        message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                        start: [10, 20],
                        end: [10, 43],
                    },
                    {
                        message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                        start: [11, 20],
                        end: [11, 52],
                    },
                    {
                        message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                        start: [12, 20],
                        end: [12, 30],
                    },
                    {
                        message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                        start: [13, 20],
                        end: [13, 37],
                    },
                    {
                        message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                        start: [14, 20],
                        end: [14, 38],
                    },
                ],
            })
        })
    })

    describe('ASL Improvements', async () => {
        it('Does not show diagnostics for valid document containing ASL Improvements', async () => {
            await testValidations({
                json: documentValidAslImprovements,
                diagnostics: [],
            })
        })

        describe('Test validation of ResultSelector field', async () => {
            it('Does not show diagnostics for valid JSON paths', async () => {
                await testValidations({
                    json: documentValidResultSelectorJsonPath,
                    diagnostics: [],
                })
            })

            it('Does not show diagnostics for valid Intrinsic Functions', async () => {
                await testValidations({
                    json: documentValidResultSelectorIntrinsicFunction,
                    diagnostics: [],
                })
            })

            it('Shows diagnostics for invalid JSON paths', async () => {
                await testValidations({
                    json: documentInvalidResultSelectorJsonPath,
                    diagnostics: [
                        {
                            message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                            start: [9, 18],
                            end: [9, 18],
                        },
                        {
                            message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                            start: [12, 28],
                            end: [12, 30],
                        },
                        {
                            message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                            start: [13, 28],
                            end: [13, 32],
                        },
                        {
                            message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                            start: [14, 21],
                            end: [14, 28],
                        },
                    ],
                })
            })

            it('Shows diagnostics for invalid Intrinsic Functions', async () => {
                await testValidations({
                    json: documentInvalidResultSelectorIntrinsicFunction,
                    diagnostics: [
                        {
                            message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                            start: [9, 20],
                            end: [9, 72],
                        },
                        {
                            message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                            start: [10, 20],
                            end: [10, 43],
                        },
                        {
                            message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                            start: [11, 20],
                            end: [11, 52],
                        },
                        {
                            message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                            start: [12, 20],
                            end: [12, 30],
                        },
                        {
                            message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                            start: [13, 20],
                            end: [13, 37],
                        },
                        {
                            message: MESSAGES.INVALID_JSON_PATH_OR_INTRINSIC,
                            start: [14, 20],
                            end: [14, 39],
                        },
                    ],
                })
            })
        })
    })
})
