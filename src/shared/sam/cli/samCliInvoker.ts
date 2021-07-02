/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as logger from '../../logger'
import { ChildProcess, ChildProcessResult } from '../../utilities/childProcess'
import {
    makeRequiredSamCliProcessInvokeOptions,
    SamCliProcessInvokeOptions,
    SamCliProcessInvoker,
} from './samCliInvokerUtils'

import * as nls from 'vscode-nls'
import { DefaultSamCliConfiguration, SamCliConfiguration } from './samCliConfiguration'
import { DefaultSettingsConfiguration } from '../../settingsConfiguration'
import { extensionSettingsPrefix } from '../../constants'
const localize = nls.loadMessageBundle()

/**
 * Yet another `sam` CLI wrapper.
 *
 * TODO: Merge this with `DefaultSamLocalInvokeCommand`.
 */
export class DefaultSamCliProcessInvoker implements SamCliProcessInvoker {
    private childProcess?: ChildProcess
    private readonly context: SamCliConfiguration
    public constructor(params: {
        preloadedConfig?: SamCliConfiguration
        locationProvider?: { getLocation(): Promise<string | undefined> }
    }) {
        if (params.preloadedConfig && params.locationProvider) {
            throw new Error('Invalid constructor args for DefaultSamCliProcessInvoker')
        }
        if (params.preloadedConfig) {
            this.context = params.preloadedConfig
        } else if (params.locationProvider) {
            this.context = new DefaultSamCliConfiguration(
                new DefaultSettingsConfiguration(extensionSettingsPrefix),
                params.locationProvider
            )
        } else {
            throw new Error('Invalid constructor args for DefaultSamCliProcessInvoker')
        }
    }

    public stop(): void {
        if (!this.childProcess) {
            throw new Error('not started')
        }
        this.childProcess.stop()
    }

    public async invoke(options?: SamCliProcessInvokeOptions): Promise<ChildProcessResult> {
        const invokeOptions = makeRequiredSamCliProcessInvokeOptions(options)
        const logging = options?.logging !== false
        const getLogger = logging ? logger.getLogger : logger.getNullLogger
        const log = getLogger()

        const sam = await this.context.getOrDetectSamCli()
        if (!sam.path) {
            log.warn('SAM CLI not found and not configured')
        } else if (sam.autoDetected) {
            log.info('SAM CLI not configured, using SAM found at: %O', sam.path)
        }

        const samCommand = sam.path ? sam.path : 'sam'
        this.childProcess = new ChildProcess(
            logging,
            samCommand,
            invokeOptions.spawnOptions,
            ...invokeOptions.arguments
        )

        getLogger('channel').info(localize('AWS.running.command', 'Running command: {0}', `${this.childProcess}`))
        log.verbose(`running: ${this.childProcess}`)
        return await this.childProcess.run(
            (text: string) => {
                getLogger('debugConsole').info(text)
                log.verbose(`stdout: ${text}`)
                if (options?.onStdout) {
                    options.onStdout(text)
                }
            },
            (text: string) => {
                getLogger('debugConsole').info(text)
                log.verbose(`stderr: ${text}`)
                if (options?.onStderr) {
                    options.onStderr(text)
                }
            }
        )
    }
}
