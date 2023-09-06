/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'

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
    getInvalidSamMsg,
} from '../../../../shared/sam/cli/samCliValidationNotification'

describe('getInvalidSamMsg', async function () {
    const fakeSamCliValidationNotification: SamCliValidationNotification = {
        show: () => {
            throw new Error('show is unused')
        },
    }
    const actionLabelUpdateSamCli = 'Install latest SAM CLI'
    const actionLabelUpdateToolkit = 'Install latest AWS Toolkit'

    it('handles SamCliNotFoundError', async function () {
        getInvalidSamMsg(
            new SamCliNotFoundError(),
            (message: string, actions: SamCliValidationNotificationAction[]): SamCliValidationNotification => {
                assert.ok(message.includes('Cannot find SAM CLI'), `unexpected validation message: ${message}`)
                assert.strictEqual(actions.length, 1, 'unexpected action count')
                assert.strictEqual(
                    actions[0].label(),
                    actionLabelUpdateSamCli,
                    `unexpected action label: ${actions[0].label()}`
                )

                return fakeSamCliValidationNotification
            }
        )
    })

    const versionValidationTestScenarios = [
        {
            situation: 'SAM CLI Version is too low',
            versionValidation: SamCliVersionValidation.VersionTooLow,
            messageFragment: 'Update SAM CLI.',
            actionLabel: actionLabelUpdateSamCli,
        },
        {
            situation: 'SAM CLI Version is too high',
            versionValidation: SamCliVersionValidation.VersionTooHigh,
            messageFragment: 'Update AWS Toolkit.',
            actionLabel: actionLabelUpdateToolkit,
        },
        {
            situation: 'SAM CLI failed to run',
            versionValidation: SamCliVersionValidation.VersionNotParseable,
            messageFragment: process.platform === 'win32' ? 'known issues' : 'SAM CLI failed to run',
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

            getInvalidSamMsg(
                error,
                (message: string, actions: SamCliValidationNotificationAction[]): SamCliValidationNotification => {
                    const hasMsg = message.includes(test.messageFragment)
                    const hasVersion =
                        test.versionValidation === SamCliVersionValidation.VersionNotParseable ||
                        message.includes(validatorResult.version!)
                    assert.ok(hasMsg && hasVersion, `unexpected validation message: ${message}`)
                    assert.strictEqual(actions.length, 1, 'unexpected action count')
                    assert.strictEqual(
                        actions[0].label(),
                        test.actionLabel,
                        `unexpected action label: ${actions[0].label()}`
                    )

                    return fakeSamCliValidationNotification
                }
            )
        })
    })

    it('handles Unexpected input', async function () {
        getInvalidSamMsg(
            new InvalidSamCliError('different error'),
            (message: string, actions: SamCliValidationNotificationAction[]): SamCliValidationNotification => {
                assert.ok(
                    message.includes('Unexpected error while') && message.includes('different error'),
                    `unexpected validation message: ${message}`
                )
                assert.strictEqual(actions.length, 0, 'unexpected actions found')

                return fakeSamCliValidationNotification
            }
        )
    })
})
