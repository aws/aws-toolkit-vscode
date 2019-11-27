/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { SpawnOptions } from 'child_process'
import { SamCliContext } from '../../../../shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../../../shared/sam/cli/samCliInit'
import { SamCliProcessInvoker } from '../../../../shared/sam/cli/samCliInvokerUtils'
import {
    MINIMUM_SAM_CLI_VERSION_INCLUSIVE,
    SamCliValidator,
    SamCliValidatorResult,
    SamCliVersionValidation
} from '../../../../shared/sam/cli/samCliValidator'
import { ChildProcessResult } from '../../../../shared/utilities/childProcess'
import { getTestLogger } from '../../../globalSetup.test'
import { assertThrowsError } from '../../utilities/assertUtils'
import { assertArgIsPresent, assertArgsContainArgument } from './samCliTestUtils'
import {
    assertErrorContainsBadExitMessage,
    assertLogContainsBadExitInformation,
    BadExitCodeSamCliProcessInvoker,
    TestSamCliProcessInvoker
} from './testSamCliProcessInvoker'

describe('runSamCliInit', async () => {
    class FakeChildProcessResult implements ChildProcessResult {
        public exitCode: number = 0
        public error = undefined
        public stdout: string = ''
        public stderr: string = ''
    }

    // Returns FakeChildProcessResult for each invoke
    class ExtendedTestSamCliProcessInvoker extends TestSamCliProcessInvoker {
        public constructor(onInvoke: (spawnOptions: SpawnOptions, ...args: any[]) => void) {
            super((spawnOptions: SpawnOptions, ...args: any[]) => {
                onInvoke(spawnOptions, ...args)

                return new FakeChildProcessResult()
            })
        }
    }

    class FakeSamCliValidator implements SamCliValidator {
        private readonly version: string
        public constructor(version: string = MINIMUM_SAM_CLI_VERSION_INCLUSIVE) {
            this.version = version
        }
        public async detectValidSamCli(): Promise<SamCliValidatorResult> {
            return {
                samCliFound: true,
                versionValidation: {
                    version: this.version,
                    validation: SamCliVersionValidation.Valid
                }
            }
        }
    }

    const defaultFakeValidator = new FakeSamCliValidator()

    const sampleDependencyManager = 'npm'

    const sampleSamInitArgs: SamCliInitArgs = {
        name: 'qwerty',
        location: '/some/path/to/code.js',
        runtime: 'nodejs8.10',
        dependencyManager: sampleDependencyManager
    }

    it('Passes init command to sam cli', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
            (spawnOptions: SpawnOptions, args: any[]) => {
                assert.ok(args.length > 0, 'Expected args to be present')
                assert.strictEqual(args[0], 'init', 'Expected first arg to be the init command')
            }
        )

        const context: SamCliContext = {
            validator: defaultFakeValidator,
            invoker: processInvoker
        }

        await runSamCliInit(sampleSamInitArgs, context)
    })

    it('Passes name to sam cli', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
            (spawnOptions: SpawnOptions, args: any[]) => {
                assertArgsContainArgument(args, '--name', sampleSamInitArgs.name)
            }
        )

        const context: SamCliContext = {
            validator: defaultFakeValidator,
            invoker: processInvoker
        }

        await runSamCliInit(sampleSamInitArgs, context)
    })

    it('Passes location to sam cli', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
            (spawnOptions: SpawnOptions, args: any[]) => {
                assert.strictEqual(spawnOptions.cwd, sampleSamInitArgs.location, 'Unexpected cwd')
            }
        )

        const context: SamCliContext = {
            validator: defaultFakeValidator,
            invoker: processInvoker
        }

        await runSamCliInit(sampleSamInitArgs, context)
    })

    it('Passes runtime to sam cli', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
            (spawnOptions: SpawnOptions, args: any[]) => {
                assertArgsContainArgument(args, '--runtime', sampleSamInitArgs.runtime)
            }
        )

        const context: SamCliContext = {
            validator: defaultFakeValidator,
            invoker: processInvoker
        }

        await runSamCliInit(sampleSamInitArgs, context)
    })

    it('throws on unexpected exit code', async () => {
        const badExitCodeProcessInvoker = new BadExitCodeSamCliProcessInvoker({})
        const context: SamCliContext = {
            validator: defaultFakeValidator,
            invoker: badExitCodeProcessInvoker
        }

        const error = await assertThrowsError(async () => {
            await runSamCliInit(sampleSamInitArgs, context)
        }, 'Expected an error to be thrown')

        assertErrorContainsBadExitMessage(error, badExitCodeProcessInvoker.error.message)
        await assertLogContainsBadExitInformation(
            getTestLogger(),
            badExitCodeProcessInvoker.makeChildProcessResult(),
            0
        )
    })

    it('Passes --no-interactive', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
            (spawnOptions: SpawnOptions, args: any[]) => {
                assertArgIsPresent(args, '--no-interactive')
            }
        )

        const context: SamCliContext = {
            validator: new FakeSamCliValidator(),
            invoker: processInvoker
        }

        await runSamCliInit(sampleSamInitArgs, context)
    })

    it('Passes --app-template', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
            (spawnOptions: SpawnOptions, args: any[]) => {
                assertArgsContainArgument(args, '--app-template', 'hello-world')
            }
        )

        const context: SamCliContext = {
            validator: new FakeSamCliValidator(),
            invoker: processInvoker
        }

        await runSamCliInit(sampleSamInitArgs, context)
    })

    it('Passes --dependency-manager', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
            (spawnOptions: SpawnOptions, args: any[]) => {
                assertArgsContainArgument(args, '--dependency-manager', sampleDependencyManager)
            }
        )

        const context: SamCliContext = {
            validator: new FakeSamCliValidator(),
            invoker: processInvoker
        }

        await runSamCliInit(sampleSamInitArgs, context)
    })
})
