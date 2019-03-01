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

export function registerCommand<T>(
    command: string,
    callback: (...args: any[]) => (Promise<ResultWithTelemetry<T> | void>),
    thisArg?: any
): vscode.Disposable {
    return vscode.commands.registerCommand(
        command,
        async (args) => {
            const startTime = new Date()
            let hasException = false
            let result: ResultWithTelemetry<T> | void

            try {
                result = await callback(args)
            } catch (e) {
                hasException = true
                throw e
            } finally {
                let datum: Datum
                if (result !== undefined && result.telemetryDatum !== undefined) {
                    datum = result.telemetryDatum
                } else {
                    datum = defaultMetricDatum(name)
                }
                if (datum.metadata === undefined) {
                    datum.metadata = new Map()
                }
                datum.metadata.set('hasException', `${hasException}`)
                datum.metadata.set('duration', `${new Date().getMilliseconds() - startTime.getMilliseconds()}`)

                ext.telemetry.record({
                    namespace: 'Command',
                    createTime: new Date(),
                    data: [datum]
                })
            }
        },
        thisArg
    )
}
