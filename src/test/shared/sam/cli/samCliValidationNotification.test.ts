/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'

import {
    makeSamCliValidationNotification,
    SamCliValidationNotification,
    SamCliValidationNotificationAction,
} from '../../../../shared/sam/cli/samCliValidationNotification'
import {
    InvalidSamCliError,
    InvalidSamCliVersionError,
    SamCliNotFoundError,
    SamCliVersionValidation,
    SamCliVersionValidatorResult,
} from '../../../../shared/sam/cli/samCliValidator'

describe('makeSamCliValidationNotification', async () => {
    const fakeSamCliValidationNotification: SamCliValidationNotification = {
        show: () => {
            throw new Error('show is unused')
        },
    }
    const actionLabelUpdateSamCli = 'Get SAM CLI'
    const actionLabelUpdateToolkit = 'Visit Marketplace'

    it('handles SamCliNotFoundError', async () => {
        makeSamCliValidationNotification(
            new SamCliNotFoundError(),
            (message: string, actions: SamCliValidationNotificationAction[]): SamCliValidationNotification => {
                assert.ok(message.indexOf('Unable to find SAM CLI') !== -1, `unexpected validation message: ${message}`)
                assert.strictEqual(actions.length, 1, 'unexpected action count')
                assert.strictEqual(
                    actions[0].label,
                    actionLabelUpdateSamCli,
                    `unexpected action label: ${actions[0].label}`
                )

                return fakeSamCliValidationNotification
            }
        )
    })

    const versionValidationTestScenarios = [
        {
            situation: 'SAM CLI Version is too low',
            versionValidation: SamCliVersionValidation.VersionTooLow,
            messageFragment: 'Please update your SAM CLI.',
            actionLabel: actionLabelUpdateSamCli,
        },
        {
            situation: 'SAM CLI Version is too high',
            versionValidation: SamCliVersionValidation.VersionTooHigh,
            messageFragment: 'Please check the Marketplace for an updated Toolkit.',
            actionLabel: actionLabelUpdateToolkit,
        },
        {
            situation: 'SAM CLI Version is unparsable',
            versionValidation: SamCliVersionValidation.VersionNotParseable,
            messageFragment: 'Please update your SAM CLI.',
            actionLabel: actionLabelUpdateSamCli,
        },
    ]

    versionValidationTestScenarios.forEach(test => {
        it(`handles InvalidSamCliVersionError - ${test.situation}`, async () => {
            const validatorResult: SamCliVersionValidatorResult = {
                version: '1.2.3',
                validation: test.versionValidation,
            }
            const error = new InvalidSamCliVersionError(validatorResult)

            makeSamCliValidationNotification(
                error,
                (message: string, actions: SamCliValidationNotificationAction[]): SamCliValidationNotification => {
                    assert.ok(
                        message.indexOf(test.messageFragment) !== -1 &&
                            message.indexOf(validatorResult.version!) !== -1,
                        `unexpected validation message: ${message}`
                    )
                    assert.strictEqual(actions.length, 1, 'unexpected action count')
                    assert.strictEqual(
                        actions[0].label,
                        test.actionLabel,
                        `unexpected action label: ${actions[0].label}`
                    )

                    return fakeSamCliValidationNotification
                }
            )
        })
    })

    it('handles Unexpected input', async () => {
        makeSamCliValidationNotification(
            new InvalidSamCliError('different error'),
            (message: string, actions: SamCliValidationNotificationAction[]): SamCliValidationNotification => {
                assert.ok(
                    message.indexOf('An unexpected issue') !== -1 && message.indexOf('different error') !== -1,
                    `unexpected validation message: ${message}`
                )
                assert.strictEqual(actions.length, 0, 'unexpected actions found')

                return fakeSamCliValidationNotification
            }
        )
    })
})
