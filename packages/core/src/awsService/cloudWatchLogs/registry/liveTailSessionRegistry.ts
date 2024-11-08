/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { cloudwatchLogsLiveTailScheme } from '../../../shared/constants'
import { LiveTailSession, LiveTailSessionConfiguration } from './liveTailSession'

export class LiveTailSessionRegistry extends Map<string, LiveTailSession> {
    static #instance: LiveTailSessionRegistry

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public constructor() {
        super()
    }
}

export function createLiveTailURIFromArgs(sessionData: LiveTailSessionConfiguration): vscode.Uri {
    let uriStr = `${cloudwatchLogsLiveTailScheme}:${sessionData.region}:${sessionData.logGroupName}`

    if (sessionData.logStreamFilter) {
        if (sessionData.logStreamFilter.type !== 'all') {
            uriStr += `:${sessionData.logStreamFilter.type}:${sessionData.logStreamFilter.filter}`
        } else {
            uriStr += `:${sessionData.logStreamFilter.type}`
        }
    }
    uriStr += sessionData.logEventFilterPattern ? `:${sessionData.logEventFilterPattern}` : ''

    return vscode.Uri.parse(uriStr)
}
