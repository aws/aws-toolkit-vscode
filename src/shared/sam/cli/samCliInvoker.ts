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

export class DefaultSamCliProcessInvoker implements SamCliProcessInvoker {
    public constructor(private readonly context: SamCliProcessInvokerContext = resolveSamCliProcessInvokerContext()) {}

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
        const childProcess: ChildProcess = new ChildProcess(
            samCommand,
            invokeOptions.spawnOptions,
            ...invokeOptions.arguments
        )

        options?.channelLogger?.info('AWS.running.command', 'Running command: {0}', `${childProcess}`)
        logger.verbose(`running: ${childProcess}`)
        return await childProcess.run(
            (text: string) => {
                options?.channelLogger?.emitMessage(text)
                logger.verbose(`stdout: ${text}`)
            },
            (text: string) => {
                options?.channelLogger?.emitMessage(text)
                logger.verbose(`stderr: ${text}`)
            }
        )
    }
}
