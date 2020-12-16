/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { extensionSettingsPrefix } from '../../constants'
import { getLogger } from '../../logger'
import { DefaultSettingsConfiguration } from '../../settingsConfiguration'
import { ChildProcess, ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliConfiguration, SamCliConfiguration } from './samCliConfiguration'
import {
    makeRequiredSamCliProcessInvokeOptions,
    SamCliProcessInvokeOptions,
    SamCliProcessInvoker,
} from './samCliInvokerUtils'
import { DefaultSamCliLocationProvider } from './samCliLocator'

export interface SamCliProcessInvokerContext {
    cliConfig: SamCliConfiguration
}

export class DefaultSamCliProcessInvokerContext implements SamCliProcessInvokerContext {
    public cliConfig: SamCliConfiguration = new DefaultSamCliConfiguration(
        new DefaultSettingsConfiguration(extensionSettingsPrefix),
        new DefaultSamCliLocationProvider()
    )
}

export function resolveSamCliProcessInvokerContext(
    params: Partial<SamCliProcessInvokerContext> = {}
): SamCliProcessInvokerContext {
    const defaults = new DefaultSamCliProcessInvokerContext()

    return {
        cliConfig: params.cliConfig || defaults.cliConfig,
    }
}

/**
 * Yet another `sam` CLI wrapper.
 *
 * TODO: Merge this with `DefaultSamLocalInvokeCommand`.
 */
export class DefaultSamCliProcessInvoker implements SamCliProcessInvoker {
    private childProcess?: ChildProcess
    public constructor(private readonly context: SamCliProcessInvokerContext = resolveSamCliProcessInvokerContext()) {}

    public stop(): void {
        if (!this.childProcess) {
            throw new Error('not started')
        }
        this.childProcess.stop()
    }

    public async invoke(options?: SamCliProcessInvokeOptions): Promise<ChildProcessResult> {
        const invokeOptions = makeRequiredSamCliProcessInvokeOptions(options)
        const logger = getLogger()

        const sam = await this.context.cliConfig.getOrDetectSamCli()
        if (!sam.path) {
            logger.warn('SAM CLI not found and not configured')
        } else if (sam.autoDetected) {
            logger.info('SAM CLI not configured, using SAM found at: %O', sam.path)
        }

        const samCommand = sam.path ? sam.path : 'sam'
        this.childProcess = new ChildProcess(samCommand, invokeOptions.spawnOptions, ...invokeOptions.arguments)

        options?.channelLogger?.info('AWS.running.command', 'Running command: {0}', `${this.childProcess}`)
        logger.verbose(`running: ${this.childProcess}`)
        return await this.childProcess.run(
            (text: string) => {
                options?.channelLogger?.emitMessage(text)
                logger.verbose(`stdout: ${text}`)
                if (options?.onStdout) {
                    options.onStdout(text)
                }
            },
            (text: string) => {
                options?.channelLogger?.emitMessage(text)
                logger.verbose(`stderr: ${text}`)
                if (options?.onStderr) {
                    options.onStderr(text)
                }
            }
        )
    }
}
