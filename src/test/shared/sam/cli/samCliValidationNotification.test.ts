/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'

import {
    InvalidSamCliError,
    InvalidSamCliVersionError,
    SamCliNotFoundError,
    SamCliVersionValidation,
    SamCliVersionValidatorResult,
} from '../../../../shared/sam/cli/samCliValidator'
import {
    SamCliValidationNotification,
    SamCliValidationNotificationAction,
    makeSamCliValidationNotification,
} from '../../../../shared/sam/cli/samCliValidationNotification'

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
                assert.ok(message.includes('Cannot find SAM CLI'), `unexpected validation message: ${message}`)
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
            messageFragment: 'Update your SAM CLI.',
            actionLabel: actionLabelUpdateSamCli,
        },
        {
            situation: 'SAM CLI Version is too high',
            versionValidation: SamCliVersionValidation.VersionTooHigh,
            messageFragment: 'Check the Marketplace for an updated AWS Toolkit.',
            actionLabel: actionLabelUpdateToolkit,
        },
        {
            situation: 'SAM CLI Version is unparsable',
            versionValidation: SamCliVersionValidation.VersionNotParseable,
            messageFragment: 'Update your SAM CLI.',
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
                        message.includes(test.messageFragment) && message.includes(validatorResult.version!),
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
                    message.includes('An unexpected issue') && message.includes('different error'),
                    `unexpected validation message: ${message}`
                )
                assert.strictEqual(actions.length, 0, 'unexpected actions found')

                return fakeSamCliValidationNotification
            }
        )
    })
})
