/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { getLogger, LogLevel } from '../logger'
import { Loggable } from '../logger/loggableType'

// TODO: Consider NLS initialization/configuration here & have packages to import localize from here
export const localize = nls.loadMessageBundle()

export interface TemplateParams {
    nlsKey: string
    nlsTemplate: string
    templateTokens?: Loggable[]
}

export interface TemplateParser {
    (nlsKey: string, nlsTemplate: string, ...templateTokens: Loggable[]): string
}

export interface TemplateHandler {
    (nlsKey: string, nlsTemplate: string, ...templateTokens: Loggable[]): void
}

export function processTemplate<T extends TemplateParams>({
    nlsKey,
    nlsTemplate,
    templateTokens = [],
}: T): { errors: Error[]; prettyMessage: string } {
    const prettyTokens: Exclude<Loggable, Error>[] = []
    const errors: Error[] = []
    if (templateTokens) {
        templateTokens.forEach(token => {
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
    }
}

export interface ChannelLogger {
    readonly channel: vscode.OutputChannel
    verbose: TemplateHandler
    debug: TemplateHandler
    info: TemplateHandler
    warn: TemplateHandler
    error: TemplateHandler
}

/**
 * Wrapper around normal logger that writes to output channel and normal logs.
 * Avoids making two log statements when writing to output channel and improves consistency
 */
export function getChannelLogger(channel: vscode.OutputChannel): ChannelLogger {
    const logger = getLogger()

    function log({ nlsKey, nlsTemplate, templateTokens, level }: TemplateParams & { level: LogLevel }): void {
        if (level === 'error') {
            channel.show(true)
        }
        const { prettyMessage, errors } = processTemplate({ nlsKey, nlsTemplate, templateTokens })
        channel.appendLine(prettyMessage)
        // TODO: Log in english if/when we get multi lang support
        // Log pretty message then Error objects (so logger might show stack traces)
        logger[level](prettyMessage, ...errors)
    }

    return Object.freeze({
        channel,
        verbose: (nlsKey: string, nlsTemplate: string, ...templateTokens: Loggable[]) =>
            log({
                level: 'verbose',
                nlsKey,
                nlsTemplate,
                templateTokens,
            }),
        debug: (nlsKey: string, nlsTemplate: string, ...templateTokens: Loggable[]) =>
            log({
                level: 'debug',
                nlsKey,
                nlsTemplate,
                templateTokens,
            }),
        info: (nlsKey: string, nlsTemplate: string, ...templateTokens: Loggable[]) =>
            log({
                level: 'info',
                nlsKey,
                nlsTemplate,
                templateTokens,
            }),
        warn: (nlsKey: string, nlsTemplate: string, ...templateTokens: Loggable[]) =>
            log({
                level: 'warn',
                nlsKey,
                nlsTemplate,
                templateTokens,
            }),
        error: (nlsKey: string, nlsTemplate: string, ...templateTokens: Loggable[]) =>
            log({
                level: 'error',
                nlsKey,
                nlsTemplate,
                templateTokens,
            }),
    })
}
