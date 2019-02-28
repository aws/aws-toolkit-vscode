/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as fs from 'fs'
import * as path from 'path'
import uuidv4 = require('uuid/v4')
import { ExtensionContext } from 'vscode'
import * as filesystem from '../filesystem'
import { DefaultTelemetryClient } from './defaultTelemetryClient'
import { DefaultTelemetryPublisher } from './defaultTelemetryPublisher'
import { TelemetryEvent } from './telemetryEvent'
import { TelemetryPublisher } from './telemetryPublisher'
import { TelemetryService } from './telemetryService'

export class DefaultTelemetryService implements TelemetryService {
    public static readonly TELEMETRY_COGNITO_ID_KEY = 'telemetryId'
    public static readonly TELEMETRY_CLIENT_ID_KEY = 'telemetryClientId'

    private static readonly DEFAULT_FLUSH_PERIOD_MILLIS = 1000 * 60 * 5 // 5 minutes in milliseconds

    public startTime: Date
    public readonly persistFilePath: string
    // start off disabled
    // this flag will only ever be true if the user has made a decision
    private _telemetryEnabled: boolean = false
    private _telemetryOptionExplicitlyStated = false

    private _flushPeriod: number
    private _timer?: NodeJS.Timer
    private publisher?: TelemetryPublisher
    private readonly _eventQueue: TelemetryEvent[]

    public constructor(private readonly context: ExtensionContext, publisher?: TelemetryPublisher) {
        const persistPath = context.globalStoragePath
        this.persistFilePath = path.join(persistPath, 'telemetryCache')

        if (!fs.existsSync(persistPath)) {
            fs.mkdirSync(persistPath)
        }

        this.startTime = new Date()
        this._eventQueue = DefaultTelemetryService.readEventsFromCache(this.persistFilePath)

        this._flushPeriod = DefaultTelemetryService.DEFAULT_FLUSH_PERIOD_MILLIS

        if (publisher !== undefined) {
            this.publisher = publisher
        }
    }

    public notifyOptOutOptionMade() {
        this._telemetryOptionExplicitlyStated = true
    }

    public async start(): Promise<void> {
        this.record({
            namespace: 'ToolkitStart',
            createTime: this.startTime
        })
        await this.startTimer()
    }

    public async shutdown(): Promise<void> {
        if (this._timer !== undefined) {
            clearTimeout(this._timer)
            this._timer = undefined
        }
        const currTime = new Date()
        this.record({
            namespace: 'ToolkitEnd',
            createTime: currTime,
            data: [
                {
                    name: 'duration',
                    value: (currTime.getTime() - this.startTime.getTime()),
                    unit: 'Milliseconds'
                }
            ]
        })

        // only write events to disk if telemetry is enabled at shutdown time
        if (this.telemetryEnabled) {
            try {
                await filesystem.writeFile(this.persistFilePath, JSON.stringify(this._eventQueue))
            } catch {}
        }
    }

    public get telemetryEnabled(): boolean {
        return this._telemetryEnabled
    }
    public set telemetryEnabled(value: boolean) {
        // clear the queue on explicit disable
        if (!value) {
            this.clearRecords()
        }
        this._telemetryEnabled = value
    }

    public get timer(): NodeJS.Timer | undefined {
        return this._timer
    }

    public set flushPeriod(period: number) {
        this._flushPeriod = period
    }

    public record(event: TelemetryEvent): void {
        // record events only if telemetry is enabled or the user hasn't expressed a preference
        // events should only be flushed if the user has consented
        if (this.telemetryEnabled || !this._telemetryOptionExplicitlyStated) {
            this._eventQueue.push(event)
        }
    }

    public get records(): ReadonlyArray<TelemetryEvent> {
        return this._eventQueue
    }

    public clearRecords(): void {
        this._eventQueue.length = 0
    }

    private async flushRecords(): Promise<void> {
        if (this.telemetryEnabled) {
            if (this.publisher === undefined) {
                await this.createDefaultPublisherAndClient()
            }
            if (this.publisher !== undefined) {
                this.publisher.enqueue(...this._eventQueue)
                await this.publisher.flush()
                this.clearRecords()
            }
        } else if (this._telemetryOptionExplicitlyStated) {
            // explicitly clear the queue if user has disabled telemetry
            this.clearRecords()
        }
    }

    private async startTimer(): Promise<void> {
        this._timer = setTimeout(
            // this is async so that we don't have pseudo-concurrent invocations of the callback
            async () => {
                await this.flushRecords()
                this._timer!.refresh()
            },
            this._flushPeriod
        )
    }

    private async createDefaultPublisher(): Promise<TelemetryPublisher | undefined> {
        try {
            // grab our clientId and generate one if it doesn't exist
            let clientId = this.context.globalState.get<string>(DefaultTelemetryService.TELEMETRY_CLIENT_ID_KEY)
            if (!clientId) {
                clientId = uuidv4()
                await this.context.globalState.update(DefaultTelemetryService.TELEMETRY_CLIENT_ID_KEY, clientId)
            }

            // grab our Cognito identityId
            const poolId = DefaultTelemetryClient.DEFAULT_IDENTITY_POOL
            const identityMapJson = this.context.globalState.get<string>(
                DefaultTelemetryService.TELEMETRY_COGNITO_ID_KEY,
                '[]'
            )
            // Maps don't cleanly de/serialize with JSON.parse/stringify so we need to do it ourselves
            const identityMap = new Map<string, string>(JSON.parse(identityMapJson) as Iterable<[string, string]>)
            // convert the value to a map
            const identity = identityMap.get(poolId)

            // if we don't have an identity, get one
            if (!identity) {
                const identityPublisherTuple =
                    await DefaultTelemetryPublisher.fromDefaultIdentityPool(clientId)

                // save it
                identityMap.set(poolId, identityPublisherTuple.cognitoIdentityId)
                await this.context.globalState.update(
                    DefaultTelemetryService.TELEMETRY_COGNITO_ID_KEY,
                    JSON.stringify(Array.from(identityMap.entries()))
                )

                // return the publisher
                return identityPublisherTuple.publisher
            } else {
                return DefaultTelemetryPublisher.fromIdentityId(clientId, identity)
            }
        } catch (err) {
            console.error(`Got ${err} while initializing telemetry publisher`)
        }
    }

    private async createDefaultPublisherAndClient(): Promise<void> {
        this.publisher = await this.createDefaultPublisher()
        if (this.publisher !== undefined) {
            await this.publisher.init()
        }
    }

    private static readEventsFromCache(cachePath: string): TelemetryEvent[] {
        try {
            const events = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as TelemetryEvent[]
            events.forEach((element: TelemetryEvent) => {
                element.createTime = new Date(element.createTime)
            })

            return events
        } catch {
            return []
        }
    }

}
