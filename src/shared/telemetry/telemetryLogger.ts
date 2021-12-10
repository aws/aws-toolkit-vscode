/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MetricDatum, MetadataEntry } from './clienttelemetry'

interface MetadataQuery {
    /** Metric name to look up in the log */
    readonly metricName: string
    /** Returns the metric containing the metadata instead of just the metadata (default: false) */
    readonly returnMetric?: boolean
    /** Attributes to filter out of the metadata */
    readonly filters?: string[]
}

interface MetricQuery extends MetadataQuery {
    readonly returnMetric: true
}

interface Metadata {
    [key: string]: string | boolean | undefined
}

export type Query = MetricQuery | MetadataQuery

/**
 * Simple class to log queryable metrics.
 *
 * Does not track any other telemetry APIs such as feedback.
 */
export class TelemetryLogger {
    private readonly _metrics: MetricDatum[] = []

    public get metricCount(): number {
        return this._metrics.length
    }

    public log(...metrics: MetricDatum[]): void {
        this._metrics.push(...metrics)
    }

    /**
     * Queries against the log, returning matched entries.
     * By default this returns just the metadata, though it can return the entire metric by
     * setting `selectMetadata` to false.
     *
     * **All metadata values are casted to strings by the telemetry client**
     */
    public query(query: MetricQuery): MetricDatum[]
    public query(query: MetadataQuery): Metadata[]
    public query(query: Query): Metadata[] | MetricDatum[] {
        const metrics = this._metrics.filter(m => m.MetricName === query.metricName)

        if (!query.returnMetric) {
            return metrics.map(m => m.Metadata ?? []).map(m => this.mapMetadata(m, query.filters ?? []))
        }

        return metrics
    }

    public reset(): void {
        this._metrics.length = 0
    }

    private isValidEntry(datum: MetadataEntry): datum is Required<MetadataEntry> {
        return datum.Key !== undefined && datum.Value !== undefined
    }

    /**
     * Telemetry currently sends metadata as an array of key/value pairs, but this is unintuitive for JS
     */
    private mapMetadata(metadata: Required<MetricDatum>['Metadata'], filters: string[]): Metadata {
        const result: Metadata = {}
        return metadata
            .filter(this.isValidEntry.bind(this))
            .filter(a => !filters.includes(a.Key))
            .reduce((a, b) => ((a[b.Key] = b.Value), a), result)
    }
}
