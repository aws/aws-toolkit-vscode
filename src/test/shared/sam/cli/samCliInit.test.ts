/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { SpawnOptions } from 'child_process'
import { TestLogger } from '../../../../shared/loggerUtils'
import { runSamCliInit, SamCliInitArgs } from '../../../../shared/sam/cli/samCliInit'
import { SamCliProcessInvoker } from '../../../../shared/sam/cli/samCliInvokerUtils'
import { ChildProcessResult } from '../../../../shared/utilities/childProcess'
import { assertThrowsError } from '../../utilities/assertUtils'
import { assertArgsContainArgument } from './samCliTestUtils'
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

    let logger: TestLogger
    const sampleSamInitArgs: SamCliInitArgs = {
        name: 'qwerty',
        location: '/some/path/to/code.js',
        runtime: 'nodejs8.10'
    }

    before(async () => {
        logger = await TestLogger.createTestLogger()
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    it('Passes init command to sam cli', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
            (spawnOptions: SpawnOptions, args: any[]) => {
                assert.ok(args.length > 0, 'Expected args to be present')
                assert.strictEqual(args[0], 'init', 'Expected first arg to be the init command')
            }
        )

        await runSamCliInit(sampleSamInitArgs, processInvoker)
    })

    it('Passes name to sam cli', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
            (spawnOptions: SpawnOptions, args: any[]) => {
                assertArgsContainArgument(args, '--name', sampleSamInitArgs.name)
            }
        )

        await runSamCliInit(sampleSamInitArgs, processInvoker)
    })

    it('Passes location to sam cli', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
            (spawnOptions: SpawnOptions, args: any[]) => {
                assert.strictEqual(spawnOptions.cwd, sampleSamInitArgs.location, 'Unexpected cwd')
            }
        )

        await runSamCliInit(sampleSamInitArgs, processInvoker)
    })

    it('Passes runtime to sam cli', async () => {
        const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
            (spawnOptions: SpawnOptions, args: any[]) => {
                assertArgsContainArgument(args, '--runtime', sampleSamInitArgs.runtime)
            }
        )

        await runSamCliInit(sampleSamInitArgs, processInvoker)
    })

    it('throws on unexpected exit code', async () => {
        const badExitCodeProcessInvoker = new BadExitCodeSamCliProcessInvoker({})

        const error = await assertThrowsError(async () => {
            await runSamCliInit(sampleSamInitArgs, badExitCodeProcessInvoker)
        }, 'Expected an error to be thrown')

        assertErrorContainsBadExitMessage(error, badExitCodeProcessInvoker.error.message)
        await assertLogContainsBadExitInformation(logger, badExitCodeProcessInvoker.makeChildProcessResult(), 0)
    })
})
