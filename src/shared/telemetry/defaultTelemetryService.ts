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
import { getLogger } from '../logger'
import { DefaultTelemetryClient } from './defaultTelemetryClient'
import { DefaultTelemetryPublisher } from './defaultTelemetryPublisher'
import { recordSessionEnd, recordSessionStart } from './telemetry'
import { TelemetryEvent } from './telemetryEvent'
import { TelemetryFeedback } from './telemetryFeedback'
import { TelemetryPublisher } from './telemetryPublisher'
import { TelemetryService } from './telemetryService'
import { ACCOUNT_METADATA_KEY, AccountStatus } from './telemetryTypes'

export class DefaultTelemetryService implements TelemetryService {
    public static readonly TELEMETRY_COGNITO_ID_KEY = 'telemetryId'
    public static readonly TELEMETRY_CLIENT_ID_KEY = 'telemetryClientId'

    private static readonly DEFAULT_FLUSH_PERIOD_MILLIS = 1000 * 60 * 5 // 5 minutes in milliseconds

    public startTime: Date
    public readonly persistFilePath: string
    private _telemetryEnabled: boolean = false

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

        this._eventQueue = []
        this._flushPeriod = DefaultTelemetryService.DEFAULT_FLUSH_PERIOD_MILLIS

        if (publisher !== undefined) {
            this.publisher = publisher
        }
    }

    public async start(): Promise<void> {
        this._eventQueue.push(...DefaultTelemetryService.readEventsFromCache(this.persistFilePath))
        recordSessionStart()
        await this.startTimer()
    }

    public async shutdown(): Promise<void> {
        if (this._timer !== undefined) {
            clearTimeout(this._timer)
            this._timer = undefined
        }
        const currTime = new Date()
        recordSessionEnd({ value: currTime.getTime() - this.startTime.getTime() })

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
        if (this._telemetryEnabled !== value) {
            getLogger().verbose(`Telemetry is now ${value ? 'enabled' : 'disabled'}`)
        }

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

    public async postFeedback(feedback: TelemetryFeedback): Promise<void> {
        if (this.publisher === undefined) {
            await this.createDefaultPublisherAndClient()
        }

        if (this.publisher === undefined) {
            throw new Error('Failed to initialize telemetry publisher')
        }

        return this.publisher.postFeedback(feedback)
    }

    public record(event: TelemetryEvent, awsContext?: AwsContext): void {
        if (this.telemetryEnabled) {
            const actualAwsContext = awsContext || this.awsContext
            const eventWithAccountMetadata = this.injectAccountMetadata(event, actualAwsContext)
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
        }
    }

    private async startTimer(): Promise<void> {
        this._timer = setTimeout(
            // this is async so that we don't have pseudo-concurrent invocations of the callback
            async () => {
                await this.flushRecords()
                // Race: _timer may be undefined after shutdown() (this async
                // closure may be pending on the event-loop, despite clearTimeout()).
                if (this._timer !== undefined) {
                    this._timer!.refresh()
                }
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
                    Metadata: [{ Key: ACCOUNT_METADATA_KEY, Value: accountValue }],
                },
            ]
            event.data = data
        }

        return event
    }

    private static readEventsFromCache(cachePath: string): TelemetryEvent[] {
        try {
            if (!fs.existsSync(cachePath)) {
                getLogger().info(`telemetry cache not found: '${cachePath}'`)

                return []
            }
            const input = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
            const events = filterTelemetryCacheEvents(input)
            events.forEach((element: TelemetryEvent) => {
                // This is coercing the createTime into a Date type: it's read in as a string
                element.createTime = new Date(element.createTime)
            })

            return events
        } catch (error) {
            // tslint:disable-next-line: no-unsafe-any
            getLogger().error(error)

            return []
        }
    }
}

export function filterTelemetryCacheEvents(input: any): TelemetryEvent[] {
    if (!Array.isArray(input)) {
        getLogger().error(`Input into filterTelemetryCacheEvents:\n${input}\nis not an array!`)

        return []
    }
    const arr = input as any[]

    return arr
        .filter((item: any) => {
            // Make sure the item is an object
            if (item !== Object(item)) {
                getLogger().error(`Item in telemetry cache:\n${item}\nis not an object! skipping!`)

                return false
            }

            return true
        })
        .filter((item: Object) => {
            // Only accept objects that have createTime and data because that's what's required by TelemetryEvent
            if (!item.hasOwnProperty('createTime') || !item.hasOwnProperty('data')) {
                getLogger().warn(`Item in telemetry cache: ${item}\n does not have 'data' or 'createTime'! skipping!`)

                return false
            }

            return true
        })
        .filter((item: TelemetryEvent) => {
            // skip it if data is not an array or empty
            if (!Array.isArray(item.data) || item.data.length === 0) {
                getLogger().warn(`Item in telemetry cache: ${item}\n has invalid data field: ${item.data}! skipping!`)

                return false
            }

            // Only accept objects that have value and metricname which are the base things required for telemetry
            return item.data.every(data => {
                // Make sure data is actually an object then check that it has the required properties
                if (data !== Object(data) || !data.hasOwnProperty('Value') || !data.hasOwnProperty('MetricName')) {
                    getLogger().warn(
                        `Item in telemetry cache: ${item}\n has invalid data in the field 'data': ${data}! skipping!`
                    )

                    return false
                }

                if (data?.Metadata?.some(m => m?.Value === undefined || m.Value === '')) {
                    getLogger().warn(`telemetry: skipping cached item with null/empty metadata field:\n${item}`)

                    return false
                }

                return true
            })
        }) as TelemetryEvent[]
}
