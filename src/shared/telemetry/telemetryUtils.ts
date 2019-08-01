/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ext } from '../extensionGlobals'
import { Datum, METADATA_FIELD_NAME, MetadataResult, TelemetryName } from './telemetryTypes'

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
    telemetryName = {
        namespace: 'Command',
        name: command
    },
    callback
}: {
    command: string
    thisArg?: any
    register?: typeof vscode.commands.registerCommand
    telemetryName?: TelemetryName
    callback(...args: any[]): Promise<T & { datum?: Datum } | void>
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
                const datum = result && result.datum ? result.datum : defaultMetricDatum(telemetryName.name)
                if (!datum.metadata) {
                    datum.metadata = new Map()
                }
                setMetadataIfNotExists(
                    datum.metadata,
                    METADATA_FIELD_NAME.RESULT,
                    hasException ? MetadataResult.Fail.toString() : MetadataResult.Pass.toString()
                )
                setMetadataIfNotExists(datum.metadata, 'duration', `${endTime.getTime() - startTime.getTime()}`)

                ext.telemetry.record({
                    namespace: telemetryName.namespace,
                    createTime: startTime,
                    data: [datum]
                })
            }

            return result
        },
        thisArg
    )
}

function setMetadataIfNotExists(metadata: Map<string, string>, key: string, value: string) {
    if (!metadata.has(key)) {
        metadata.set(key, value)
    }
}
