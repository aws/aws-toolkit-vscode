/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../logger/logger'
import { DevSettings } from '../settings'
import { isReleaseVersion } from '../vscode/env'
import { MetricDatum, MetadataEntry } from './clienttelemetry'

export interface MetricQuery {
    /**
     * Metric name to look up in the log
     */
    readonly metricName: string

    /**
     * Exclude metadata items matching these keys.
     */
    readonly excludeKeys?: string[]
}

/** Telemetry metadata in the form of a javscript Object. */
export interface MetadataObj {
    [key: string]: string | undefined
}

function isValidEntry(datum: MetadataEntry): datum is Required<MetadataEntry> {
    return datum.Key !== undefined && datum.Value !== undefined
}

/**
 * Takes a Telemetry metadata key-value pairs array:
 * ```
 *      [ {Key:'a',Value:…}, {Key:'b',Value:…}, … ]
 * ```
 * and produces an object:
 * ```
 *      {a:…, b:…}
 * ```
 */
export const mapMetadata = (excludeKeys: string[]) => (metadata: Required<MetricDatum>['Metadata']) => {
    const result: MetadataObj = {}
    return metadata
        .filter(isValidEntry)
        .filter((a) => !excludeKeys.includes(a.Key))
        .reduce((a, b) => ((a[b.Key] = b.Value), a), result)
}

/** Transforms a metric for human readability in logs, etc. */
function scrubMetric(metric: MetricDatum): any {
    const metaMap = mapMetadata(['MetricName'])(metric.Metadata ?? [])
    metaMap.awsAccount = metaMap.awsAccount && metaMap.awsAccount.length > 10 ? '[omitted]' : metaMap.awsAccount
    const metricCopy = { ...metric, Metadata: metaMap } as any
    delete metricCopy.MetricName // Redundant.
    delete metricCopy.EpochTimestamp // Not interesting.
    return metricCopy
}

/**
 * Simple class to log queryable metrics.
 *
 * Does not track any other telemetry APIs such as feedback.
 */
export class TelemetryLogger {
    private readonly _metrics: MetricDatum[] = []
    private readonly isDevMode: boolean

    public constructor() {
        const devSettings = DevSettings.instance
        this.isDevMode = devSettings.isDevMode()
    }

    public get metricCount(): number {
        return this._metrics.length
    }

    public clear(): void {
        this._metrics.length = 0
    }

    public log(metric: MetricDatum): void {
        const msg = `telemetry: ${metric.MetricName}`

        if (this.isDevMode || !isReleaseVersion()) {
            this._metrics.push(metric)
            if (getLogger().logLevelEnabled('debug')) {
                const metricCopy = scrubMetric(metric)
                getLogger().debug(`${msg} %O`, metricCopy)
            } else {
                getLogger().verbose(msg)
            }

            if (this.metricCount > 1000) {
                this.clear()
                getLogger().verbose('telemetry: cleared buffered metrics')
            }
        } else {
            getLogger().verbose(msg)
        }
    }

    /**
     * Queries against the log, returning matched entries.
     * Only returns the metadata. See {@link queryFull} for getting the entire metric.
     *
     * **All metadata values are casted to strings by the telemetry client**
     */
    public query(query: MetricQuery): MetadataObj[] {
        return this.queryFull(query)
            .map((m) => m.Metadata ?? [])
            .map(mapMetadata(query.excludeKeys ?? []))
    }

    /**
     * Queries telemetry for metrics, returning the entire structure.
     */
    public queryFull(query: MetricQuery): MetricDatum[] {
        return this._metrics.filter((m) => m.MetricName === query.metricName)
    }

    /**
     * Queries telemetry for metrics with metadata key or value matching the given regex.
     */
    public queryRegex(re: RegExp | string): MetricDatum[] {
        return this._metrics.filter((m) => m.Metadata?.some((md) => md.Value?.match(re) || md.Key?.match(re)))
    }
}
