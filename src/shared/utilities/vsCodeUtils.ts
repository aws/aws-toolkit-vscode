/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
export const localize = nls.loadMessageBundle()

import { ErrorOrString, getLogger, Logger } from '../logger'

// ------- Experimental combined output channel & traditional logger  --------------

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogParams {
    args: ErrorOrString[],
    channel: vscode.OutputChannel,
    level: LogLevel,
    logger: Logger,
    msg: string,
    nlsKey: string,
}

// TODO: Leverage 3rd party code: https://raw.githubusercontent.com/Microsoft/vscode-nls/master/src/main.ts
function defaultTranslation(message: string, ...args: any[]): string {
    if (!args.length) {
        return message
    }
    try {
        return `${message} - args: ${JSON.stringify(args)}`
    } catch (error) {
        return `${message} - args: ${String(args)}`
    }

}

function log({ args = [], channel, level, msg, nlsKey, logger }: LogParams): void {
    if (level === 'error') {
        channel.show(true)
    }
    const [arg0, ...restArgs] = args

    if (arg0 && arg0 instanceof Error) {
        // TODO: Define standard/strategy. Sometimes err.message is part of msg. Probably shouldn't be.
        channel.appendLine(
            localize(nlsKey, msg, arg0.message, ...restArgs)
        )
        // TODO: Swap to use new logging facility when available
        logger[level](
            defaultTranslation(msg, arg0.message, ...restArgs)
        )
        if (arg0.stack) {
            logger[level](arg0.stack)
        }

    } else {
        channel.appendLine(
            localize(nlsKey, msg, ...args)
        )
        // TODO: Swap to use new logging facility when available
        logger[level](
            defaultTranslation(msg, ...args)
        )
    }
}

/**
 * Wrapper around normal logger that writes to output channel and normal logs.
 * Avoids making two log statements when writing to output channel and improves consistency
 * @param channelName: Name of the output channel to write to
 */
export function getChannelLogger(channel: vscode.OutputChannel, logger: Logger = getLogger()) {
    return {
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
// ------- End experimental combined output channel & traditional logger  --------------

export async function getDebugPort(): Promise<number> {
    // TODO: Find available port
    return 5858
}
