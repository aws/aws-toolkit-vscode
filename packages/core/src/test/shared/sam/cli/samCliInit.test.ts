/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SpawnOptions } from 'child_process'
import {
    eventBridgeStarterAppTemplate,
    getSamCliTemplateParameter,
    helloWorldTemplate,
    lazyLoadSamTemplateStrings,
} from '../../../../lambda/models/samTemplates'
import { SamCliContext } from '../../../../shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../../../shared/sam/cli/samCliInit'
import { SamCliProcessInvoker, makeUnexpectedExitCodeError } from '../../../../shared/sam/cli/samCliInvokerUtils'
import { ChildProcessResult } from '../../../../shared/utilities/childProcess'
import { getTestLogger } from '../../../globalSetup.test'
import { assertArgIsPresent, assertArgNotPresent, assertArgsContainArgument } from './samCliTestUtils'
import {
    assertLogContainsBadExitInformation,
    BadExitCodeSamCliProcessInvoker,
    TestSamCliProcessInvoker,
} from './testSamCliProcessInvoker'

import { SchemaTemplateExtraContext } from '../../../../eventSchemas/templates/schemasAppTemplateUtils'
import { FakeSamCliValidator } from '../../../fakeExtensionContext'

describe('runSamCliInit', async function () {
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

    const defaultFakeValidator = new FakeSamCliValidator()

    const sampleDependencyManager = 'npm'

    let sampleSamInitArgs: SamCliInitArgs

    before(function () {
        lazyLoadSamTemplateStrings()

        sampleSamInitArgs = {
            name: 'qwerty',
            location: '/some/path/to/code.js',
            runtime: 'nodejs14.x',
            template: helloWorldTemplate,
            dependencyManager: sampleDependencyManager,
        }
    })

    describe('runSamCliInit with HelloWorld template', async function () {
        it('Passes init command to sam cli', async function () {
            const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
                (spawnOptions: SpawnOptions, args: any[]) => {
                    assert.ok(args.length > 0, 'Expected args to be present')
                    assert.strictEqual(args[0], 'init', 'Expected first arg to be the init command')
                }
            )

            const context: SamCliContext = {
                validator: defaultFakeValidator,
                invoker: processInvoker,
            }

            await runSamCliInit(sampleSamInitArgs, context)
        })

        it('Passes name to sam cli', async function () {
            const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
                (spawnOptions: SpawnOptions, args: any[]) => {
                    assertArgsContainArgument(args, '--name', sampleSamInitArgs.name)
                }
            )

            const context: SamCliContext = {
                validator: defaultFakeValidator,
                invoker: processInvoker,
            }

            await runSamCliInit(sampleSamInitArgs, context)
        })

        it('Passes location to sam cli', async function () {
            const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
                (spawnOptions: SpawnOptions, args: any[]) => {
                    assert.strictEqual(spawnOptions.cwd, sampleSamInitArgs.location, 'Unexpected cwd')
                }
            )

            const context: SamCliContext = {
                validator: defaultFakeValidator,
                invoker: processInvoker,
            }

            await runSamCliInit(sampleSamInitArgs, context)
        })

        it('Passes runtime to sam cli', async function () {
            const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
                (spawnOptions: SpawnOptions, args: any[]) => {
                    assertArgsContainArgument(args, '--runtime', sampleSamInitArgs.runtime!)
                }
            )

            const context: SamCliContext = {
                validator: defaultFakeValidator,
                invoker: processInvoker,
            }

            await runSamCliInit(sampleSamInitArgs, context)
        })

        it('throws on unexpected exit code', async function () {
            const badExitCodeProcessInvoker = new BadExitCodeSamCliProcessInvoker({})
            const context: SamCliContext = {
                validator: defaultFakeValidator,
                invoker: badExitCodeProcessInvoker,
            }

            const expectedError = makeUnexpectedExitCodeError(badExitCodeProcessInvoker.error.message)
            await assert.rejects(
                runSamCliInit(sampleSamInitArgs, context),
                expectedError,
                'Expected error was not thrown'
            )

            await assertLogContainsBadExitInformation(
                getTestLogger(),
                badExitCodeProcessInvoker.makeChildProcessResult(),
                0
            )
        })

        it('Passes --no-interactive', async function () {
            const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
                (spawnOptions: SpawnOptions, args: any[]) => {
                    assertArgIsPresent(args, '--no-interactive')
                }
            )

            const context: SamCliContext = {
                validator: new FakeSamCliValidator(),
                invoker: processInvoker,
            }

            await runSamCliInit(sampleSamInitArgs, context)
        })

        it('Passes --app-template', async function () {
            const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
                (spawnOptions: SpawnOptions, args: any[]) => {
                    assertArgsContainArgument(args, '--app-template', getSamCliTemplateParameter(helloWorldTemplate))
                    assertArgNotPresent(args, '--extra-content')
                }
            )

            const context: SamCliContext = {
                validator: new FakeSamCliValidator(),
                invoker: processInvoker,
            }

            await runSamCliInit(sampleSamInitArgs, context)
        })

        it('Passes --dependency-manager', async function () {
            const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
                (spawnOptions: SpawnOptions, args: any[]) => {
                    assertArgsContainArgument(args, '--dependency-manager', sampleDependencyManager)
                }
            )

            const context: SamCliContext = {
                validator: new FakeSamCliValidator(),
                invoker: processInvoker,
            }

            await runSamCliInit(sampleSamInitArgs, context)
        })
    })

    describe('runSamCliInit With EventBridgeStartAppTemplate', async function () {
        let extraContent: SchemaTemplateExtraContext
        let samInitArgsWithExtraContent: SamCliInitArgs

        before(function () {
            lazyLoadSamTemplateStrings()

            // eslint-disable-next-line @typescript-eslint/naming-convention
            extraContent = {
                AWS_Schema_registry: 'testRegistry',
                AWS_Schema_name: 'testSchema',
                AWS_Schema_root: 'test',
                AWS_Schema_source: 'AWS',
                AWS_Schema_detail_type: 'ec2',
                user_agent: 'testAgent',
            }

            samInitArgsWithExtraContent = {
                name: 'qwerty',
                location: '/some/path/to/code.js',
                runtime: 'python3.9',
                template: eventBridgeStarterAppTemplate,
                extraContent: extraContent,
                dependencyManager: sampleDependencyManager,
            }
        })

        it('Passes --extra-context for eventBridgeStarterAppTemplate', async function () {
            const processInvoker: SamCliProcessInvoker = new ExtendedTestSamCliProcessInvoker(
                (spawnOptions: SpawnOptions, args: any[]) => {
                    assertArgsContainArgument(
                        args,
                        '--app-template',
                        getSamCliTemplateParameter(eventBridgeStarterAppTemplate)
                    )
                    assertArgsContainArgument(args, '--extra-context', JSON.stringify(extraContent))
                }
            )

            const context: SamCliContext = {
                validator: new FakeSamCliValidator(),
                invoker: processInvoker,
            }

            await runSamCliInit(samInitArgsWithExtraContent, context)
        })
    })
})
