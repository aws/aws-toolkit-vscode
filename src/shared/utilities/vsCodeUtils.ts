/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { BasicLogger, ErrorOrString, getLogger, LogLevel } from '../logger'

// TODO: Consider NLS initialization/configuration here & have packages to import localize from here
export const localize: TemplateParser = nls.loadMessageBundle()

export interface TemplateParams {
    nlsKey: string
    nlsTemplate: string
    templateTokens?: ErrorOrString[]
}

export interface TemplateParser {
    (nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]): string
}

export interface TemplateHandler {
    (nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]): void
}

export function processTemplate<T extends TemplateParams>({
    nlsKey,
    nlsTemplate,
    templateTokens = []
}: T): { errors: Error[]; prettyMessage: string } {
    const prettyTokens: Exclude<ErrorOrString, Error>[] = []
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
        prettyMessage
    }
}

export interface ChannelLogger {
    readonly channel: vscode.OutputChannel
    readonly logger: BasicLogger
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
export function getChannelLogger(channel: vscode.OutputChannel, logger: BasicLogger = getLogger()): ChannelLogger {
    function log({ nlsKey, nlsTemplate, templateTokens, level }: TemplateParams & { level: LogLevel }): void {
        if (level === 'error') {
            channel.show(true)
        }
        const { prettyMessage, errors } = processTemplate({ nlsKey, nlsTemplate, templateTokens })
        channel.appendLine(prettyMessage)
        // TODO: Log in english if/when we get multi lang support
        // Log pretty message then Error objects (so logger might show stack traces)
        logger[level](...[prettyMessage, ...errors])
    }

    return Object.freeze({
        channel,
        logger,
        verbose: (nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]) =>
            log({
                level: 'verbose',
                nlsKey,
                nlsTemplate,
                templateTokens
            }),
        debug: (nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]) =>
            log({
                level: 'debug',
                nlsKey,
                nlsTemplate,
                templateTokens
            }),
        info: (nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]) =>
            log({
                level: 'info',
                nlsKey,
                nlsTemplate,
                templateTokens
            }),
        warn: (nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]) =>
            log({
                level: 'warn',
                nlsKey,
                nlsTemplate,
                templateTokens
            }),
        error: (nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]) =>
            log({
                level: 'error',
                nlsKey,
                nlsTemplate,
                templateTokens
            })
    })
}

export async function getDebugPort(): Promise<number> {
    // TODO: Find available port
    return 5858
}
