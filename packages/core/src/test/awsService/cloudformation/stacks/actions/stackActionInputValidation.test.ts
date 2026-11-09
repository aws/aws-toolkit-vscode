/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { validateParameterValue } from '../../../../../awsService/cloudformation/stacks/actions/stackActionInputValidation'
import { TemplateParameter } from '../../../../../awsService/cloudformation/stacks/actions/stackActionRequestType'

describe('validateParameterValue', function () {
    describe('String parameters', function () {
        it('should pass valid string with AllowedValues', function () {
            const param: TemplateParameter = {
                name: 'TestParam',
                Type: 'String',
                AllowedValues: ['value1', 'value2'],
            }
            assert.strictEqual(validateParameterValue('value1', param), undefined)
        })

        it('should fail invalid string with AllowedValues', function () {
            const param: TemplateParameter = {
                name: 'TestParam',
                Type: 'String',
                AllowedValues: ['value1', 'value2'],
            }
            assert.strictEqual(validateParameterValue('invalid', param), 'Value must be one of: value1, value2')
        })

        it('should pass valid pattern', function () {
            const param: TemplateParameter = {
                name: 'TestParam',
                Type: 'String',
                AllowedPattern: '^[0-9]+$',
            }
            assert.strictEqual(validateParameterValue('123', param), undefined)
        })

        it('should fail invalid pattern', function () {
            const param: TemplateParameter = {
                name: 'TestParam',
                Type: 'String',
                AllowedPattern: '^[0-9]+$',
            }
            assert.strictEqual(validateParameterValue('abc', param), 'Value must match pattern: ^[0-9]+$')
        })

        it('should handle boolean string values', function () {
            const param: TemplateParameter = {
                name: 'TestParam',
                Type: 'String',
                AllowedValues: ['true', 'false'],
            }
            assert.strictEqual(validateParameterValue('true', param), undefined)
            assert.strictEqual(validateParameterValue('false', param), undefined)
            assert.strictEqual(validateParameterValue('invalid', param), 'Value must be one of: true, false')
        })

        it('should handle numeric string values', function () {
            const param: TemplateParameter = {
                name: 'TestParam',
                Type: 'String',
                AllowedValues: ['1', '2'],
            }
            assert.strictEqual(validateParameterValue('1', param), undefined)
            assert.strictEqual(validateParameterValue('2', param), undefined)
            assert.strictEqual(validateParameterValue('3', param), 'Value must be one of: 1, 2')
        })

        it('should handle empty string values', function () {
            const param: TemplateParameter = {
                name: 'TestParam',
                Type: 'String',
            }

            assert.strictEqual(validateParameterValue('', param), undefined)
        })
    })

    describe('Number parameters', function () {
        it('should pass valid number', function () {
            const param: TemplateParameter = {
                name: 'TestParam',
                Type: 'Number',
            }
            assert.strictEqual(validateParameterValue('42', param), undefined)
        })

        it('should fail invalid number', function () {
            const param: TemplateParameter = {
                name: 'TestParam',
                Type: 'Number',
            }
            assert.strictEqual(validateParameterValue('abc', param), 'Value must be a number')
        })

        it('should validate MinValue', function () {
            const param: TemplateParameter = {
                name: 'TestParam',
                Type: 'Number',
                MinValue: 10,
            }
            assert.strictEqual(validateParameterValue('5', param), 'Value must be at least 10')
            assert.strictEqual(validateParameterValue('15', param), undefined)
        })
    })

    describe('CommaDelimitedList parameters', function () {
        it('should pass valid comma-delimited list with AllowedValues', function () {
            const param: TemplateParameter = {
                name: 'TestParam',
                Type: 'CommaDelimitedList',
                AllowedValues: ['80', '443', '8080'],
            }
            assert.strictEqual(validateParameterValue('80,443', param), undefined)
        })

        it('should fail invalid items in comma-delimited list', function () {
            const param: TemplateParameter = {
                name: 'TestParam',
                Type: 'CommaDelimitedList',
                AllowedValues: ['80', '443', '8080'],
            }
            assert.strictEqual(
                validateParameterValue('80,9000', param),
                'Invalid values: 9000. Must be one of: 80, 443, 8080'
            )
        })

        it('should validate pattern for each item', function () {
            const param: TemplateParameter = {
                name: 'TestParam',
                Type: 'CommaDelimitedList',
                AllowedPattern: '^[0-9]+$',
            }
            assert.strictEqual(validateParameterValue('80,443', param), undefined)
            assert.strictEqual(validateParameterValue('80,abc', param), 'Values must match pattern: ^[0-9]+$')
        })

        it('should handle whitespace in comma-delimited list', function () {
            const param: TemplateParameter = {
                name: 'TestParam',
                Type: 'CommaDelimitedList',
                AllowedValues: ['80', '443'],
            }
            assert.strictEqual(validateParameterValue('80, 443', param), undefined)
        })
    })
})
