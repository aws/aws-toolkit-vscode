/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

export const localize: TemplateParser = nls.loadMessageBundle()

// TODO: initialize NLS here rather than extension.ts. Prefer packages to import localize from here
// Advantages:
//  • Ensure we only call nls.config once
//  • Don't have to call nls.loadMessageBundle() in every file

import { BasicLogger, ErrorOrString, getLogger, LogLevel } from '../logger'

export interface TemplateParams {
    nlsKey: string,
    nlsTemplate: string,
    templateTokens?: ErrorOrString[],
}

export interface TemplateParser {
    (nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]): string
}

export function processTemplate({
    nlsKey,
    nlsTemplate,
    templateTokens = [],
}: TemplateParams & {onLocalize?: TemplateParser}) {
    const prettyTokens: Exclude<ErrorOrString, Error>[] = []
    const errors: Error[] = []
    if (templateTokens) {
        templateTokens.forEach(token =>  {
            if (token instanceof Error) {
                prettyTokens.push(token.message)
                errors.push(token)
            } else {
                prettyTokens.push(token)
            }
        })
    }
    const prettyMessage = localize(nlsKey, nlsTemplate, ...prettyTokens)

    return {
        errors,
        prettyMessage,
        prettyTokens // returned for test purposes
    }
}

function log({
    nlsKey,
    nlsTemplate,
    templateTokens,
    channel,
    level,
    logger
}: TemplateParams & {channel: vscode.OutputChannel, level: LogLevel, logger: BasicLogger }): void {
    if (level === 'error') {
        channel.show(true)
    }
    const {prettyMessage, errors} = processTemplate({nlsKey, nlsTemplate, templateTokens})
    channel.appendLine(prettyMessage)
    // TODO: Log in english if/when we get multi lang support
    // Log pretty message then Error objects (so logger might show stack traces)
    logger[level](...[prettyMessage, ...errors])
}

/**
 * Wrapper around normal logger that writes to output channel and normal logs.
 * Avoids making two log statements when writing to output channel and improves consistency
 */
export function getChannelLogger(channel: vscode.OutputChannel, logger: BasicLogger = getLogger()) {
    return {
        verbose: (nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]) => log({
            level: 'verbose',
            nlsKey,
            nlsTemplate,
            templateTokens,
            channel,
            logger,
        }),
        debug: (nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]) => log({
            level: 'debug',
            nlsKey,
            nlsTemplate,
            templateTokens,
            channel,
            logger,
        }),
        info: (nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]) => log({
            level: 'info',
            nlsKey,
            nlsTemplate,
            templateTokens,
            channel,
            logger,
        }),
        warn: (nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]) => log({
            level: 'warn',
            nlsKey,
            nlsTemplate,
            templateTokens,
            channel,
            logger,
        }),
        error: (nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]) => log({
            level: 'error',
            nlsKey,
            nlsTemplate,
            templateTokens,
            channel,
            logger,
        })
    }
}

export async function getDebugPort(): Promise<number> {
    // TODO: Find available port
    return 5858
}
