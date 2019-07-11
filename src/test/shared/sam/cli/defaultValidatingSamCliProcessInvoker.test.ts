/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { TestLogger } from '../../../../shared/loggerUtils'
import { DefaultValidatingSamCliProcessInvoker } from '../../../../shared/sam/cli/defaultValidatingSamCliProcessInvoker'
import { SamCliConfiguration } from '../../../../shared/sam/cli/samCliConfiguration'
import {
    resolveSamCliProcessInvokerContext,
    SamCliProcessInvokerContext
} from '../../../../shared/sam/cli/samCliInvoker'
import { SamCliProcessInvoker } from '../../../../shared/sam/cli/samCliInvokerUtils'
import {
    InvalidSamCliVersionError,
    SamCliNotFoundError,
    SamCliValidator,
    SamCliValidatorResult,
    SamCliVersionValidation,
} from '../../../../shared/sam/cli/samCliValidator'
import { ChildProcessResult } from '../../../../shared/utilities/childProcess'
import { assertThrowsError } from '../../utilities/assertUtils'
import { TestSamCliProcessInvoker } from './testSamCliProcessInvoker'

describe('DefaultValidatingSamCliProcessInvoker', async () => {

    let logger: TestLogger
    let processInvokerContext: SamCliProcessInvokerContext
    const errorInvoker: SamCliProcessInvoker = new TestSamCliProcessInvoker(
        () => {
            assert.fail('invoke was not expected to be called')
            throw new Error('invoke was not expected to be called')
        }
    )

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

            const invoker = new DefaultValidatingSamCliProcessInvoker({
                invoker: errorInvoker,
                invokerContext: processInvokerContext,
                validator,
            })

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

        const invoker = new DefaultValidatingSamCliProcessInvoker({
            invoker: errorInvoker,
            invokerContext: processInvokerContext,
            validator,
        })

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

        const invoker = new DefaultValidatingSamCliProcessInvoker({
            invoker: errorInvoker,
            invokerContext: processInvokerContext,
            validator,
        })

        await assertThrowsError(
            async () => await invoker.invoke(), 'Expected invoke to throw an error'
        )
    })

    it('invokes when there are no validation issues', async () => {
        let timesCalled: number = 0

        const samCliInvoker: TestSamCliProcessInvoker = new TestSamCliProcessInvoker(
            () => {
                timesCalled++

                return {} as any as ChildProcessResult
            }
        )

        const validator: SamCliValidator = {
            detectValidSamCli: async (): Promise<SamCliValidatorResult> => {
                return {
                    samCliFound: true,
                    versionValidation: {
                        validation: SamCliVersionValidation.Valid
                    },
                }
            }
        }

        const invoker = new DefaultValidatingSamCliProcessInvoker({
            invoker: samCliInvoker,
            invokerContext: processInvokerContext,
            validator,
        })

        await invoker.invoke()

        assert.strictEqual(timesCalled, 1, 'Expected invoke to get called')
    })
})
