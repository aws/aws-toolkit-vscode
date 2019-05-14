/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { TestLogger } from '../../../../shared/loggerUtils'
import { DefaultValidatingSamCliProcessInvoker } from '../../../../shared/sam/cli/defaultValidatingSamCliProcessInvoker'
import { SamCliConfiguration } from '../../../../shared/sam/cli/samCliConfiguration'
import {
    resolveSamCliProcessInvokerContext,
    SamCliProcessInvokerContext
} from '../../../../shared/sam/cli/samCliInvoker'
import {
    InvalidSamCliVersionError,
    SamCliNotFoundError,
    SamCliValidator,
    SamCliValidatorResult,
    SamCliVersionValidation,
} from '../../../../shared/sam/cli/samCliValidator'
import { assertThrowsError } from '../../utilities/assertUtils'

describe('DefaultValidatingSamCliProcessInvoker', async () => {

    let logger: TestLogger
    let processInvokerContext: SamCliProcessInvokerContext

    before(async () => {
        logger = await TestLogger.createTestLogger()

        processInvokerContext = resolveSamCliProcessInvokerContext({
            cliConfig: {
                getSamCliLocation: () => 'filler'
            } as any as SamCliConfiguration,
        })
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    const versionValidationTestScenarios = [
        {
            situation: 'SAM CLI Version is too low',
            versionValidation: SamCliVersionValidation.VersionTooLow,
        },
        {
            situation: 'SAM CLI Version is too high',
            versionValidation: SamCliVersionValidation.VersionTooHigh,
        },
        {
            situation: 'SAM CLI Version is unparsable',
            versionValidation: SamCliVersionValidation.VersionNotParseable,
        },
    ]

    versionValidationTestScenarios.forEach(test => {
        it(`throws InvalidSamCliVersionError when validation reports ${test.situation}`, async () => {
            const validator: SamCliValidator = {
                detectValidSamCli: async (): Promise<SamCliValidatorResult> => {
                    return {
                        samCliFound: true,
                        versionValidation: {
                            version: '1.2.3',
                            validation: test.versionValidation,
                        }
                    }
                }
            }

            const invoker = new DefaultValidatingSamCliProcessInvoker(processInvokerContext, validator)

            const error: Error = await assertThrowsError(
                async () => await invoker.invoke(), 'Expected invoke to throw an error'
            )

            assert.ok(error instanceof InvalidSamCliVersionError, 'Unexpected error instance type')
            const versionError = error as InvalidSamCliVersionError

            assert.strictEqual(
                versionError.versionValidation.validation,
                test.versionValidation,
                'Unexpected version validation'
            )
        })
    })

    it('throws SamCliNotFoundError when sam cli cannot be found', async () => {
        const validator: SamCliValidator = {
            detectValidSamCli: async (): Promise<SamCliValidatorResult> => {
                return {
                    samCliFound: false,
                }
            }
        }

        const invoker = new DefaultValidatingSamCliProcessInvoker(processInvokerContext, validator)

        const error: Error = await assertThrowsError(
            async () => await invoker.invoke(), 'Expected invoke to throw an error'
        )

        assert.ok(error instanceof SamCliNotFoundError, 'Unexpected error instance type')
    })

    it('throws Error when given invalid validation state', async () => {
        const validator: SamCliValidator = {
            detectValidSamCli: async (): Promise<SamCliValidatorResult> => {
                return {
                    samCliFound: true,
                    versionValidation: undefined,
                }
            }
        }

        const invoker = new DefaultValidatingSamCliProcessInvoker(processInvokerContext, validator)

        await assertThrowsError(
            async () => await invoker.invoke(), 'Expected invoke to throw an error'
        )
    })
})
