/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ext } from '../extensionGlobals'
import { Metadata, MetricDatum } from './clienttelemetry'
import { METADATA_FIELD_NAME, MetadataResult } from './telemetryTypes'

export function defaultMetricDatum(name: string): MetricDatum {
    return {
        MetricName: name,
        Unit: 'Count',
        Value: 1
    }
}

export function registerCommand<T>({
    command,
    thisArg,
    register = vscode.commands.registerCommand,
    telemetryName,
    callback
}: {
    command: string
    thisArg?: any
    register?: typeof vscode.commands.registerCommand
    telemetryName: string
    callback(...args: any[]): Promise<(T & { datum?: MetricDatum }) | void>
}): vscode.Disposable {
    return register(
        command,
        async (...callbackArgs: any[]) => {
            const startTime = new Date()
            let hasException = false
            let result: (T & { datum?: MetricDatum }) | void

            try {
                result = await callback(...callbackArgs)
            } catch (e) {
                hasException = true
                throw e
            } finally {
                const endTime = new Date()
                const datum = result && result.datum ? result.datum : defaultMetricDatum(telemetryName)
                if (!datum.Metadata) {
                    datum.Metadata = []
                }
                setMetadataIfNotExists(
                    datum.Metadata,
                    METADATA_FIELD_NAME.RESULT,
                    hasException ? MetadataResult.Fail.toString() : MetadataResult.Pass.toString()
                )
                setMetadataIfNotExists(datum.Metadata, 'duration', `${endTime.getTime() - startTime.getTime()}`)

                ext.telemetry.record({
                    createTime: startTime,
                    data: [datum]
                })
            }

            return result
        },
        thisArg
    )
}

function setMetadataIfNotExists(metadata: Metadata, key: string, value: string) {
    if (!metadata.find(item => item.Key === key)) {
        metadata.push({ Key: key, Value: value })
    }
}
