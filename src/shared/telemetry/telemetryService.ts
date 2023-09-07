/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { ExtensionContext } from 'vscode'
import { AwsContext } from '../awsContext'
import { isReleaseVersion, isAutomation } from '../vscode/env'
import { getLogger } from '../logger'
import { MetricDatum } from './clienttelemetry'
import { DefaultTelemetryClient, regionKey } from './telemetryClient'
import { DefaultTelemetryPublisher } from './telemetryPublisher'
import { TelemetryFeedback } from './telemetryClient'
import { TelemetryPublisher } from './telemetryPublisher'
import { accountMetadataKey, AccountStatus, computeRegionKey } from './telemetryClient'
import { TelemetryLogger } from './telemetryLogger'
import globals from '../extensionGlobals'
import { ClassToInterfaceType } from '../utilities/tsUtils'
import { getClientId } from './util'
import { telemetry } from './telemetry'
import { FileSystemCommon } from '../../srcShared/fs'

const fs = FileSystemCommon.instance

export type TelemetryService = ClassToInterfaceType<DefaultTelemetryService>

export class DefaultTelemetryService {
    public static readonly telemetryCognitoIdKey = 'telemetryId'
    public static readonly defaultFlushPeriodMillis = 1000 * 60 * 5 // 5 minutes in milliseconds

    public startTime: Date
    public readonly persistFilePath: string
    private _telemetryEnabled: boolean = false

    private _flushPeriod: number
    private _timer?: NodeJS.Timer
    private publisher?: TelemetryPublisher
    private readonly _eventQueue: MetricDatum[]
    private readonly _telemetryLogger = new TelemetryLogger()
    /**
     * Last metric (if any) loaded from cached telemetry from a previous
     * session.
     *
     * We cannot infer this from "session_start" because there can in theory be
     * multiple "session_start" metrics cached from multiple sessions.
     */
    private _endOfCache: MetricDatum | undefined

    /**
     * Use {@link create}() to create an instance of this class.
     */
    protected constructor(
        private readonly context: ExtensionContext,
        private readonly awsContext: AwsContext,
        private readonly computeRegion?: string,
        publisher?: TelemetryPublisher
    ) {
        this.persistFilePath = path.join(context.globalStorageUri.fsPath, 'telemetryCache')

        this.startTime = new globals.clock.Date()

        this._eventQueue = []
        this._flushPeriod = DefaultTelemetryService.defaultFlushPeriodMillis

        if (publisher !== undefined) {
            this.publisher = publisher
        }
    }

    /**
     * This exists since we need to first ensure the global storage
     * path exists before creating the instance.
     */
    static async create(
        context: ExtensionContext,
        awsContext: AwsContext,
        computeRegion?: string,
        publisher?: TelemetryPublisher
    ) {
        await DefaultTelemetryService.ensureGlobalStorageExists(context)
        return new DefaultTelemetryService(context, awsContext, computeRegion, publisher)
    }

    public get logger(): TelemetryLogger {
        return this._telemetryLogger
    }

    public async start(): Promise<void> {
        // TODO: `readEventsFromCache` should be async
        this._eventQueue.push(...(await DefaultTelemetryService.readEventsFromCache(this.persistFilePath)))
        this._endOfCache = this._eventQueue[this._eventQueue.length - 1]
        telemetry.session_start.emit()
        this.startFlushInterval()
    }

    public async shutdown(): Promise<void> {
        this.clearTimer()

        // Only write events to disk at shutdown time if:
        //   1. telemetry is enabled
        //   2. we are not in CI or a test suite run
        if (this.telemetryEnabled && !isAutomation()) {
            const currTime = new globals.clock.Date()
            // This is noisy when running tests in vscode.
            telemetry.session_end.emit({ value: currTime.getTime() - this.startTime.getTime() })

            try {
                await fs.writeFile(this.persistFilePath, JSON.stringify(this._eventQueue))
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

    public record(event: MetricDatum, awsContext?: AwsContext): void {
        if (this.telemetryEnabled) {
            const actualAwsContext = awsContext || this.awsContext
            const eventWithCommonMetadata = this.injectCommonMetadata(event, actualAwsContext)
            this._eventQueue.push(eventWithCommonMetadata)
            this._telemetryLogger.log(eventWithCommonMetadata)
        }
    }

    public clearRecords(): void {
        this._eventQueue.length = 0
    }

    /**
     * This ensures the folder, where we will store things like telemetry cache, exists.
     *
     * VSCode provides the URI of the folder, but it is not guaranteed to exist.
     */
    private static async ensureGlobalStorageExists(context: ExtensionContext): Promise<void> {
        if (!fs.fileExists(context.globalStorageUri)) {
            await fs.mkdir(context.globalStorageUri)
        }
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

    /** Flushes the telemetry records every `_flushPeriod` milliseconds. */
    private startFlushInterval(): void {
        this.clearTimer()
        this._timer = globals.clock.setTimeout(async () => {
            await this.flushRecords()
            // Resets timer after the flush as completed
            this.startFlushInterval()
        }, this._flushPeriod)
    }

    /** Clears the timer used to flush the telemetry records. */
    private clearTimer(): void {
        if (this._timer !== undefined) {
            globals.clock.clearTimeout(this._timer)
            this._timer = undefined
        }
    }

    private async createDefaultPublisher(): Promise<TelemetryPublisher | undefined> {
        try {
            // grab our clientId and generate one if it doesn't exist
            const clientId = await getClientId(this.context.globalState)
            // grab our Cognito identityId
            const poolId = DefaultTelemetryClient.config.identityPool
            const identityMapJson = this.context.globalState.get<string>(
                DefaultTelemetryService.telemetryCognitoIdKey,
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
                    DefaultTelemetryService.telemetryCognitoIdKey,
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

    private injectCommonMetadata(event: MetricDatum, awsContext: AwsContext): MetricDatum {
        let accountValue: string | AccountStatus
        // The AWS account ID is not set on session start. This matches JetBrains' functionality.
        if (event.MetricName === 'session_end' || event.MetricName === 'session_start') {
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

        const commonMetadata = [{ Key: accountMetadataKey, Value: accountValue }]
        if (this.computeRegion) {
            commonMetadata.push({ Key: computeRegionKey, Value: this.computeRegion })
        }
        if (!event?.Metadata?.some((m: any) => m?.Key == regionKey)) {
            commonMetadata.push({ Key: regionKey, Value: globals.regionProvider.guessDefaultRegion() })
        }

        if (event.Metadata) {
            event.Metadata.push(...commonMetadata)
        } else {
            event.Metadata = commonMetadata
        }

        return event
    }

    private static async readEventsFromCache(cachePath: string): Promise<MetricDatum[]> {
        try {
            if ((await fs.fileExists(cachePath)) === false) {
                getLogger().info(`telemetry cache not found: '${cachePath}'`)

                return []
            }
            const input = JSON.parse(await fs.readFileAsString(cachePath))
            const events = filterTelemetryCacheEvents(input)

            return events
        } catch (error) {
            getLogger().error(error as Error)

            return []
        }
    }

    /**
     * Only passive telemetry is allowed during startup (except for some known
     * special-cases).
     */
    public assertPassiveTelemetry(didReload: boolean) {
        // Special case: these may be non-passive during a VSCode "reload". #1592
        const maybeActiveOnReload = ['sam_init']
        // Metrics from the previous session can be arbitrary: we can't reason
        // about whether they should be passive/active.
        let readingCache = true

        // Array for..of is in-order:
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach
        for (const metric of this._eventQueue) {
            if (readingCache) {
                readingCache = metric !== this._endOfCache
                // Skip cached metrics.
                continue
            }
            if (metric.Passive || (didReload && maybeActiveOnReload.includes(metric.MetricName))) {
                continue
            }
            const msg = `non-passive metric emitted at startup: ${metric.MetricName}`
            if (isReleaseVersion()) {
                getLogger().error(msg)
            } else {
                throw Error(msg)
            }
        }
    }

    /**
     * Queries the current pending (not flushed) metrics.
     *
     * @note The underlying metrics queue may be updated or flushed at any time while this iterates.
     */
    public async *findIter(predicate: (m: MetricDatum) => boolean): AsyncIterable<MetricDatum> {
        for (const m of this._eventQueue) {
            if (predicate(m)) {
                yield m
            }
        }
    }
}

export function filterTelemetryCacheEvents(input: any): MetricDatum[] {
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
        .filter((item: any) => {
            // Only accept objects that have the required telemetry data
            if (
                !Object.prototype.hasOwnProperty.call(item, 'Value') ||
                !Object.prototype.hasOwnProperty.call(item, 'MetricName') ||
                !Object.prototype.hasOwnProperty.call(item, 'EpochTimestamp') ||
                !Object.prototype.hasOwnProperty.call(item, 'Unit')
            ) {
                getLogger().warn(`skipping invalid item in telemetry cache: ${JSON.stringify(item)}\n`)

                return false
            }

            if ((item as any)?.Metadata?.some((m: any) => m?.Value === undefined || m.Value === '')) {
                getLogger().warn(`telemetry: skipping cached item with null/empty metadata field:\n${item}`)

                return false
            }

            return true
        })
}
