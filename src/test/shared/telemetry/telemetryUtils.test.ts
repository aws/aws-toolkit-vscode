/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { Disposable } from 'vscode'
import { ext } from '../../../shared/extensionGlobals'
import { TelemetryEvent } from '../../../shared/telemetry/telemetryEvent'
import { TelemetryService } from '../../../shared/telemetry/telemetryService'
import { TelemetryNamespace } from '../../../shared/telemetry/telemetryTypes'
import { registerCommand } from '../../../shared/telemetry/telemetryUtils'

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

    public async start(): Promise<void> { return }
    public async shutdown(): Promise<void> { return }
    public record(event: TelemetryEvent ): void { this.lastEvent = event }
    public clearRecords(): void {}
    public notifyOptOutOptionMade(): void {}
}

describe('telemetryUtils', () => {
    describe('registerCommand', () => {
        const mockService = new MockTelemetryService()
        ext.telemetry = mockService

        it('records telemetry', (done) => {
            registerCommand({
                register: (_command, callback: (...args: any[]) => Promise<void>, _thisArg) => {
                    // vscode.commands.registerCommand is not async, but we can't check until the callback is complete
                    callback().then(() => {
                        assert.notStrictEqual(mockService.lastEvent, undefined)
                        assert.notStrictEqual(mockService.lastEvent!.createTime, undefined)
                        assert.notStrictEqual(mockService.lastEvent!.data, undefined)
                        assert.notStrictEqual(mockService.lastEvent!.data![0].metadata, undefined)
                        assert.notStrictEqual(mockService.lastEvent!.data![0].metadata!.get('duration'), undefined)

                        assert.strictEqual(
                            mockService.lastEvent!.data![0].metadata!.get('result'), 'Succeeded'
                        )
                        assert.strictEqual(mockService.lastEvent!.namespace, 'Command')
                        assert.strictEqual(mockService.lastEvent!.data![0].name, 'command')
                        done()
                    }).catch(err => {
                        throw err
                    })

                    return Disposable.from()
                },
                command: 'command',
                callback: async () => {}
            })
        })

        it('records telemetry with custom names and namespaces', (done) => {
            registerCommand({
                register: (_command, callback: (...args: any[]) => Promise<void>, _thisArg) => {
                    // vscode.commands.registerCommand is not async, but we can't check until the callback is complete
                    callback().then(() => {
                        assert.notStrictEqual(mockService.lastEvent, undefined)
                        assert.notStrictEqual(mockService.lastEvent!.createTime, undefined)
                        assert.notStrictEqual(mockService.lastEvent!.data, undefined)
                        assert.notStrictEqual(mockService.lastEvent!.data![0].metadata, undefined)
                        assert.notStrictEqual(mockService.lastEvent!.data![0].metadata!.get('duration'), undefined)

                        assert.strictEqual(
                            mockService.lastEvent!.data![0].metadata!.get('result'), 'Succeeded'
                        )
                        assert.strictEqual(mockService.lastEvent!.namespace, TelemetryNamespace.Aws)
                        assert.strictEqual(mockService.lastEvent!.data![0].name, 'thisAintYourFathersNameField')
                        done()
                    }).catch(err => {
                        throw err
                    })

                    return Disposable.from()
                },
                command: 'command',
                callback: async () => {},
                telemetryName: {
                    namespace: TelemetryNamespace.Aws,
                    name: 'thisAintYourFathersNameField'
                }
            })
        })

        it('records telemetry with failures', (done) => {
            registerCommand({
                register: (_command, callback: (...args: any[]) => Promise<void>, _thisArg) => {
                    // vscode.commands.registerCommand is not async, but we can't check until the callback is complete
                    callback().then(() => {
                        assert.fail('skip me please!')
                        done()
                    }).catch(err => {
                        console.log(mockService.lastEvent!.data![0].metadata)
                        assert.notStrictEqual(mockService.lastEvent, undefined)
                        assert.notStrictEqual(mockService.lastEvent!.createTime, undefined)
                        assert.notStrictEqual(mockService.lastEvent!.data, undefined)
                        assert.notStrictEqual(mockService.lastEvent!.data![0].metadata, undefined)
                        assert.notStrictEqual(mockService.lastEvent!.data![0].metadata!.get('duration'), undefined)

                        assert.strictEqual(
                            mockService.lastEvent!.data![0].metadata!.get('result'), 'Failed'
                        )
                        assert.strictEqual(mockService.lastEvent!.namespace, 'Command')
                        assert.strictEqual(mockService.lastEvent!.data![0].name, 'command')
                        done()
                    })

                    return Disposable.from()
                },
                command: 'command',
                callback: async () => { throw new Error('we\'re all gonna die!') }
            })
        })
    })
})
