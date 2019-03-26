/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { ext } from '../extensionGlobals'
import { Datum } from './telemetryEvent'

export function defaultMetricDatum(name: string): Datum {
    return {
        name: name,
        unit: 'Count',
        value: 1
    }
}

export function registerCommand<T>({
    command,
    thisArg,
    register = vscode.commands.registerCommand,
    callback
}: {
    command: string
    thisArg?: any
    register?: typeof vscode.commands.registerCommand
    callback(...args: any[]): (Promise<T & { datum?: Datum } | void>)
}): vscode.Disposable {
    return register(
        command,
        async (...callbackArgs: any[]) => {
            const startTime = new Date()
            let hasException = false
            let result: T & { datum?: Datum } | void

            try {
                result = await callback(...callbackArgs)
            } catch (e) {
                hasException = true
                throw e
            } finally {
                const endTime = new Date()
                const datum = result && result.datum ? result.datum : defaultMetricDatum(command)
                if (!datum.metadata) {
                    datum.metadata = new Map()
                }
                datum.metadata.set('hasException', `${hasException}`)
                datum.metadata.set('duration', `${endTime.getTime() - startTime.getTime()}`)

                ext.telemetry.record({
                    namespace: 'Command',
                    createTime: startTime,
                    data: [datum]
                })
            }

            if (result && result.datum) {
                delete result.datum
            }

            return result
        },
        thisArg
    )
}
