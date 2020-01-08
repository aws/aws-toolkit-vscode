/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import { writeFile } from 'fs-extra'
import * as path from 'path'
import uuidv4 = require('uuid/v4')
import { ExtensionContext } from 'vscode'
import { AwsContext } from '../awsContext'
import { DefaultTelemetryClient } from './defaultTelemetryClient'
import { DefaultTelemetryPublisher } from './defaultTelemetryPublisher'
import { TelemetryEvent } from './telemetryEvent'
import { TelemetryPublisher } from './telemetryPublisher'
import { TelemetryService } from './telemetryService'
import { ACCOUNT_METADATA_KEY, AccountStatus } from './telemetryTypes'

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

    public constructor(
        private readonly context: ExtensionContext,
        private readonly awsContext: AwsContext,
        publisher?: TelemetryPublisher
    ) {
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
        this.record(
            {
                createTime: this.startTime,
                data: [
                    {
                        MetricName: 'session_start',
                        Value: 0,
                        Unit: 'None'
                    }
                ]
            },
            this.awsContext
        )
        await this.startTimer()
    }

    public async shutdown(): Promise<void> {
        if (this._timer !== undefined) {
            clearTimeout(this._timer)
            this._timer = undefined
        }
        const currTime = new Date()
        this.record(
            {
                createTime: currTime,
                data: [
                    {
                        MetricName: 'session_end',
                        Value: currTime.getTime() - this.startTime.getTime(),
                        Unit: 'Milliseconds'
                    }
                ]
            },
            this.awsContext
        )

        // only write events to disk if telemetry is enabled at shutdown time
        if (this.telemetryEnabled) {
            try {
                await writeFile(this.persistFilePath, JSON.stringify(this._eventQueue))
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

    public record(event: TelemetryEvent, awsContext?: AwsContext): void {
        // record events only if telemetry is enabled or the user hasn't expressed a preference
        // events should only be flushed if the user has consented
        const actualAwsContext = awsContext || this.awsContext
        const eventWithAccountMetadata = this.injectAccountMetadata(event, actualAwsContext)
        if (this.telemetryEnabled || !this._telemetryOptionExplicitlyStated) {
            this._eventQueue.push(eventWithAccountMetadata)
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
                const identityPublisherTuple = await DefaultTelemetryPublisher.fromDefaultIdentityPool(clientId)

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

    private injectAccountMetadata(event: TelemetryEvent, awsContext: AwsContext): TelemetryEvent {
        let accountValue: string | AccountStatus
        // The AWS account ID is not set on session start. This matches JetBrains' functionality.
        if (event.data.every(item => item.MetricName === 'session_end' || item.MetricName === 'session_start')) {
            accountValue = AccountStatus.NotApplicable
        } else {
            const account = awsContext.getCredentialAccountId()
            if (account) {
                const accountIdRegex = /[0-9]{12}/
                if (accountIdRegex.test(account)) {
                    // account is valid
                    accountValue = account
                } else {
                    // account is not valid, we can use any non-12-digit string as our stored value to trigger this.
                    // JetBrains uses this value if you're running a sam local invoke with an invalid profile.
                    // no direct calls to production AWS should ever have this value.
                    accountValue = AccountStatus.Invalid
                }
            } else {
                // user isn't logged in
                accountValue = AccountStatus.NotSet
            }
        }
        // event has data
        if (event.data) {
            for (const datum of event.data) {
                if (datum.Metadata) {
                    datum.Metadata.push({ Key: ACCOUNT_METADATA_KEY, Value: accountValue })
                } else {
                    datum.Metadata = [{ Key: ACCOUNT_METADATA_KEY, Value: accountValue }]
                }
            }
        } else {
            // event doesn't have data, give it dummy data with the account info
            // this shouldn't happen
            const data = [
                {
                    MetricName: 'noData',
                    Value: 0,
                    Metadata: [{ Key: ACCOUNT_METADATA_KEY, Value: accountValue }]
                }
            ]
            event.data = data
        }

        return event
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
