/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { ext } from '../extensionGlobals'
import { Datum, ResultWithTelemetry } from './telemetryEvent'

export function defaultMetricDatum(name: string): Datum {
    return {
        name: name,
        unit: 'Count',
        value: 1
    }
}

export function registerCommand<T>({
    command,
    callback,
    thisArg,
    register = vscode.commands.registerCommand
}: {
    command: string,
    thisArg?: any,
    register?: typeof vscode.commands.registerCommand
    callback(...args: any[]): (Promise<ResultWithTelemetry<T> | void>),
}): vscode.Disposable {
    return register(
        command,
        async (callbackArgs) => {
            const startTime = new Date()
            let hasException = false
            let result: ResultWithTelemetry<T> | void

            try {
                result = await callback(callbackArgs)
            } catch (e) {
                hasException = true
                throw e
            } finally {
                const endTime = new Date()
                const datum = result && result.telemetryDatum ? result.telemetryDatum : defaultMetricDatum(command)
                if (!datum.metadata) {
                    datum.metadata = new Map()
                }
                datum.metadata.set('hasException', `${hasException}`)
                datum.metadata.set('duration', `${endTime.getMilliseconds() - startTime.getMilliseconds()}`)

                ext.telemetry.record({
                    namespace: 'Command',
                    createTime: startTime,
                    data: [datum]
                })
            }
        },
        thisArg
    )
}
