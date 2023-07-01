/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as logger from '../../logger'
import { ChildProcess, ChildProcessResult } from '../../utilities/childProcess'
import {
    addTelemetryEnvVar,
    makeRequiredSamCliProcessInvokeOptions,
    SamCliProcessInvokeOptions,
    SamCliProcessInvoker,
} from './samCliInvokerUtils'

import * as nls from 'vscode-nls'
import { SamCliSettings } from './samCliSettings'
const localize = nls.loadMessageBundle()

/**
 * Yet another `sam` CLI wrapper.
 *
 * TODO: Merge this with `DefaultSamLocalInvokeCommand`.
 */
export class DefaultSamCliProcessInvoker implements SamCliProcessInvoker {
    private childProcess?: ChildProcess
    public constructor(private readonly context = SamCliSettings.instance) {}

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
        this.childProcess = new ChildProcess(samCommand, invokeOptions.arguments, {
            logging: options?.logging ? 'yes' : 'no',
            spawnOptions: await addTelemetryEnvVar(options?.spawnOptions),
        })

        getLogger('channel').info(localize('AWS.running.command', 'Command: {0}', `${this.childProcess}`))
        log.verbose(`running: ${this.childProcess}`)
        return await this.childProcess.run({
            onStdout: (text, context) => {
                getLogger('debugConsole').info(text)
                log.verbose(`stdout: ${text}`)
                options?.onStdout?.(text, context)
            },
            onStderr: (text, context) => {
                getLogger('debugConsole').info(text)
                log.verbose(`stderr: ${text}`)
                options?.onStderr?.(text, context)
            },
        })
    }
}
