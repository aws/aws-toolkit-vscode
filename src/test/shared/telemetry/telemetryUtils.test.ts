/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Disposable } from 'vscode'
import { ext } from '../../../shared/extensionGlobals'
import { MetricDatum } from '../../../shared/telemetry/clienttelemetry'
import { TelemetryEvent } from '../../../shared/telemetry/telemetryEvent'
import { TelemetryService } from '../../../shared/telemetry/telemetryService'
import { METADATA_FIELD_NAME, MetadataResult } from '../../../shared/telemetry/telemetryTypes'
import { defaultMetricDatum, registerCommand } from '../../../shared/telemetry/telemetryUtils'

class MockTelemetryService implements TelemetryService {
    public persistFilePath: string = ''
    public lastEvent: TelemetryEvent | undefined
    private _telemetryEnabled: boolean = false

    public get telemetryEnabled(): boolean {
        return this._telemetryEnabled
    }
    public set telemetryEnabled(value: boolean) {
        this._telemetryEnabled = value
    }

    public async start(): Promise<void> {
        return
    }
    public async shutdown(): Promise<void> {
        return
    }
    public record(event: TelemetryEvent): void {
        this.lastEvent = event
    }
    public clearRecords(): void {}
    public notifyOptOutOptionMade(): void {}
}

describe('telemetryUtils', () => {
    describe('registerCommand', () => {
        const mockService = new MockTelemetryService()
        ext.telemetry = mockService

        it('records telemetry', done => {
            registerCommand({
                register: (_command, callback: (...args: any[]) => Promise<void>, _thisArg) => {
                    // vscode.commands.registerCommand is not async, but we can't check until the callback is complete
                    callback()
                        .then(() => {
                            assert.notStrictEqual(mockService.lastEvent, undefined)
                            assert.notStrictEqual(mockService.lastEvent!.createTime, undefined)
                            assert.notStrictEqual(mockService.lastEvent!.data, undefined)
                            assert.notStrictEqual(mockService.lastEvent!.data![0].Metadata, undefined)
                            assert.ok(mockService.lastEvent!.data![0].Metadata!.some(item => item.Key === 'duration'))

                            assert.strictEqual(
                                mockService.lastEvent!.data![0].Metadata!.find(
                                    item => item.Key === METADATA_FIELD_NAME.RESULT
                                )?.Value,
                                MetadataResult.Pass
                            )
                            assert.strictEqual(mockService.lastEvent!.data![0].MetricName, 'Command_command')

                            done()
                        })
                        .catch(err => {
                            throw err
                        })

                    return Disposable.from()
                },
                command: 'command',
                callback: async () => {},
                telemetryName: 'Command_command'
            })
        })

        it('records telemetry with metadata', done => {
            registerCommand({
                register: (_command, callback: (...args: any[]) => Promise<void>, _thisArg) => {
                    // vscode.commands.registerCommand is not async, but we can't check until the callback is complete
                    callback()
                        .then(() => {
                            assert.notStrictEqual(mockService.lastEvent, undefined)
                            assert.notStrictEqual(mockService.lastEvent!.createTime, undefined)
                            assert.notStrictEqual(mockService.lastEvent!.data, undefined)

                            const data = mockService.lastEvent!.data![0]
                            assert.notStrictEqual(data.Metadata, undefined)
                            const metadata = data.Metadata!

                            assert.notStrictEqual(metadata.find(item => item.Key === 'duration')?.Value, undefined)

                            assert.strictEqual(
                                metadata.find(item => item.Key === METADATA_FIELD_NAME.RESULT)?.Value,
                                MetadataResult.Pass
                            )
                            assert.strictEqual(metadata.find(item => item.Key === 'foo')?.Value, 'bar')
                            assert.strictEqual(metadata.find(item => item.Key === 'hitcount')?.Value, '5')

                            assert.strictEqual(data.MetricName, 'somemetric')
                            done()
                        })
                        .catch(err => {
                            throw err
                        })

                    return Disposable.from()
                },
                command: 'command',
                callback: async () => {
                    const datum: MetricDatum = defaultMetricDatum('somemetric')
                    datum.Metadata = [
                        { Key: 'foo', Value: 'bar' },
                        { Key: 'hitcount', Value: '5' }
                    ]

                    return {
                        datum
                    }
                },
                telemetryName: 'Command.somemetric'
            })
        })

        it('records telemetry with metadata overriding result and duration', done => {
            registerCommand({
                register: (_command, callback: (...args: any[]) => Promise<void>, _thisArg) => {
                    // vscode.commands.registerCommand is not async, but we can't check until the callback is complete
                    callback()
                        .then(() => {
                            const data = mockService.lastEvent!.data![0]
                            const metadata = data.Metadata!

                            assert.strictEqual(
                                metadata.find(item => item.Key === METADATA_FIELD_NAME.RESULT)?.Value,
                                'bananas',
                                'Unexpected value for metadata.result'
                            )
                            assert.strictEqual(
                                metadata.find(item => item.Key === 'duration')?.Value,
                                '999999',
                                'Unexpected value for metadata.duration'
                            )

                            done()
                        })
                        .catch(err => {
                            throw err
                        })

                    return Disposable.from()
                },
                command: 'command',
                callback: async () => {
                    const datum: MetricDatum = defaultMetricDatum('somemetric')
                    datum.Metadata = [
                        { Key: METADATA_FIELD_NAME.RESULT, Value: 'bananas' },
                        { Key: 'duration', Value: '999999' }
                    ]

                    return {
                        datum
                    }
                },
                telemetryName: 'Command.command'
            })
        })

        it('records telemetry with custom names and namespaces', done => {
            registerCommand({
                register: (_command, callback: (...args: any[]) => Promise<void>, _thisArg) => {
                    // vscode.commands.registerCommand is not async, but we can't check until the callback is complete
                    callback()
                        .then(() => {
                            assert.notStrictEqual(mockService.lastEvent, undefined)
                            assert.notStrictEqual(mockService.lastEvent!.createTime, undefined)
                            assert.notStrictEqual(mockService.lastEvent!.data, undefined)
                            assert.notStrictEqual(
                                mockService.lastEvent!.data![0]?.Metadata!.find(item => item.Key === 'duration')?.Value,
                                undefined
                            )

                            assert.strictEqual(
                                mockService.lastEvent!.data![0].Metadata!.find(
                                    item => item.Key === METADATA_FIELD_NAME.RESULT
                                )?.Value,
                                MetadataResult.Pass
                            )
                            assert.strictEqual(mockService.lastEvent!.data![0].MetricName, 'Command_command')
                            done()
                        })
                        .catch(err => {
                            throw err
                        })

                    return Disposable.from()
                },
                command: 'command',
                callback: async () => {},
                telemetryName: 'Command_command'
            })
        })

        it('records telemetry with failures', done => {
            registerCommand({
                register: (_command, callback: (...args: any[]) => Promise<void>, _thisArg) => {
                    // vscode.commands.registerCommand is not async, but we can't check until the callback is complete
                    callback()
                        .then(() => {
                            assert.fail('skip me please!')
                            done()
                        })
                        .catch(err => {
                            console.log(mockService.lastEvent!.data![0].Metadata)
                            assert.notStrictEqual(mockService.lastEvent, undefined)
                            assert.notStrictEqual(mockService.lastEvent!.createTime, undefined)
                            assert.notStrictEqual(mockService.lastEvent!.data, undefined)
                            assert.notStrictEqual(mockService.lastEvent!.data![0].Metadata, undefined)
                            assert.notStrictEqual(
                                mockService.lastEvent!.data![0].Metadata!.find(item => item.Key === 'duration'),
                                undefined
                            )

                            assert.strictEqual(
                                mockService.lastEvent!.data![0].Metadata!.find(
                                    item => item.Key === METADATA_FIELD_NAME.RESULT
                                )?.Value,
                                MetadataResult.Fail
                            )
                            assert.strictEqual(mockService.lastEvent!.data![0].MetricName, 'Command.command')
                            done()
                        })

                    return Disposable.from()
                },
                command: 'command',
                callback: async () => {
                    throw new Error("we're all gonna die!")
                },
                telemetryName: 'Command.command'
            })
        })
    })
})
