/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
export const localize = nls.loadMessageBundle()

import { ErrorOrString, getLogger, Logger, LogLevel } from '../logger'

interface LogParams {
    args: ErrorOrString[],
    channel: vscode.OutputChannel,
    level: LogLevel,
    logger: Logger,
    msg: string,
    nlsKey: string,
}

function log({ args = [], channel, level, msg, nlsKey, logger }: LogParams): void {
    if (level === 'error') {
        channel.show(true)
    }

    // Check for Error types and make them pretty
    const prettyArgs = args.map(arg =>  arg instanceof Error ? arg.message : arg)
    channel.appendLine(
        localize(nlsKey, msg, ...prettyArgs)
    )
    logger[level](
        // TODO: Use english if/when we get multi lang support
        localize(nlsKey, msg, ...prettyArgs)
        // format(msg, ...args)
    )
}

/**
 * Wrapper around normal logger that writes to output channel and normal logs.
 * Avoids making two log statements when writing to output channel and improves consistency
 * @param channelName: Name of the output channel to write to
 */
export function getChannelLogger(channel: vscode.OutputChannel, logger: Logger = getLogger()) {
    return {
        verbose: (nlsKey: string, msg: string, ...args: ErrorOrString[]) => log({
            level: 'verbose',
            args,
            channel,
            logger,
            msg,
            nlsKey,
        }),
        debug: (nlsKey: string, msg: string, ...args: ErrorOrString[]) => log({
            level: 'debug',
            args,
            channel,
            logger,
            msg,
            nlsKey,
        }),
        info: (nlsKey: string, msg: string, ...args: ErrorOrString[]) => log({
            level: 'info',
            args,
            channel,
            logger,
            msg,
            nlsKey,
        }),
        warn: (nlsKey: string, msg: string, ...args: ErrorOrString[]) => log({
            level: 'warn',
            args,
            channel,
            logger,
            msg,
            nlsKey,
        }),
        error: (nlsKey: string, msg: string, ...args: ErrorOrString[]) => log({
            level: 'error',
            args,
            channel,
            logger,
            msg,
            nlsKey,
        })
    }
}

export async function getDebugPort(): Promise<number> {
    // TODO: Find available port
    return 5858
}
