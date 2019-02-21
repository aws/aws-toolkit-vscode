/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as fs from 'fs'
import * as path from 'path'
import uuidv4 = require('uuid/v4')
import { ExtensionContext } from 'vscode'
import { DefaultTelemetryPublisher } from './defaultTelemetryPublisher'
import { TelemetryEvent, TelemetryEventArray } from './telemetryEvent'
import { TelemetryPublisher } from './telemetryPublisher'
import { TelemetryService } from './telemetryService'

export class DefaultTelemetryService implements TelemetryService {
    public static readonly TELEMETRY_COGNITO_ID_KEY = 'telemetryId'
    public static readonly TELEMETRY_CLIENT_ID_KEY = 'telemetryClientId'

    private static readonly DEFAULT_FLUSH_PERIOD = 1000 * 60 * 5 // 5 minutes in milliseconds

    // TODO: make this user configurable
    public telemetryEnabled: boolean = false
    public startTime: Date

    public readonly persistFilePath: string

    private flushPeriod: number
    private timer?: NodeJS.Timer
    private publisher?: TelemetryPublisher

    private readonly context: ExtensionContext
    private readonly persistPath: string
    private readonly eventQueue: TelemetryEventArray

    public constructor(context: ExtensionContext, publisher?: TelemetryPublisher) {
        this.context = context
        this.persistPath = context.globalStoragePath
        this.persistFilePath = path.join(this.persistPath, 'telemetryCache')

        if (!fs.existsSync(this.persistPath)) {
            fs.mkdirSync(this.persistPath)
        }

        this.startTime = new Date()
        this.eventQueue = DefaultTelemetryService.readEventsFromCache(this.persistFilePath)

        console.log(this.eventQueue)
        this.flushPeriod = DefaultTelemetryService.DEFAULT_FLUSH_PERIOD

        if (publisher !== undefined) {
            this.publisher = publisher
        }
    }

    public async start() {
        this.record({
            namespace: 'ToolkitStart',
            createTime: this.startTime
        })
        await this.startTimer()
    }

    public async shutdown() {
        if (this.timer !== undefined) {
            clearTimeout(this.timer!!)
            this.timer = undefined
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

        return new Promise<any>(resolve => fs.writeFile(this.persistFilePath, JSON.stringify(this.eventQueue), resolve))
    }

    public getTimer() {
        return this.timer
    }

    public setFlushPeriod(period: number) {
        this.flushPeriod = period
    }

    public record(event: TelemetryEvent) {
        this.eventQueue.push(event)
    }

    public getRecords(): ReadonlyArray<TelemetryEvent> {
        return this.eventQueue
    }

    private async flushRecords() {
        if (this.telemetryEnabled) {
            if (this.publisher === undefined) {
                await this.createDefaultPublisherAndClient()
            }
            if (this.publisher !== undefined) {
                this.publisher!.enqueue(this.eventQueue)
                await this.publisher!.flush()
                this.eventQueue.length = 0
            }
        } else {
            this.eventQueue.length = 0
        }
    }

    private async startTimer() {
        this.timer = setTimeout(
            async () => {
                const fn = async () => {
                    await this.flushRecords()
                    this.timer = setTimeout(fn, this.flushPeriod)
                }
                await fn()
            },
            this.flushPeriod
        )
    }

    private async createDefaultPublisher() {
        try {
            let clientId = this.context.globalState.get(DefaultTelemetryService.TELEMETRY_CLIENT_ID_KEY)
            if (clientId === undefined) {
                clientId = uuidv4()
                await this.context.globalState.update(DefaultTelemetryService.TELEMETRY_CLIENT_ID_KEY, clientId)
            }

            const identity = this.context.globalState.get(DefaultTelemetryService.TELEMETRY_COGNITO_ID_KEY)

            if (identity === undefined) {
                const [identityId, publisher] =
                    await DefaultTelemetryPublisher.fromDefaultIdentityPool(clientId as string)
                await this.context.globalState.update(DefaultTelemetryService.TELEMETRY_COGNITO_ID_KEY, identityId)

                return publisher
            } else if (identity !== undefined) {
                return DefaultTelemetryPublisher.fromIdentityId(clientId as string, identity as string)
            } else {
                return
            }
        } catch (err) {
            console.error(`Got ${err} while initializing telemetry batcher`)
        }
    }

    private async createDefaultPublisherAndClient() {
        this.publisher = await this.createDefaultPublisher()
        await (this.publisher as DefaultTelemetryPublisher).createDefaultTelemetryClient()
    }

    private static readEventsFromCache(cachePath: string): TelemetryEventArray {
        try {
            const events = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as TelemetryEventArray
            events.forEach((element: TelemetryEvent) => {
                element.createTime = new Date(element.createTime)
            })

            return events
        } catch (_) {
            return new TelemetryEventArray()
        }
    }

}
