/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

import * as telemetry from './telemetry'
import type { AsyncLocalStorage as AsyncLocalStorageClass } from 'async_hooks'

const AsyncLocalStorage: typeof AsyncLocalStorageClass =
    require('async_hooks').AsyncLocalStorage ??
    class<T> {
        readonly #store: T[] = []
        #disabled = false

        public disable() {
            this.#disabled = true
        }

        public getStore() {
            return this.#disabled ? undefined : this.#store[0]
        }

        public run<R>(store: T, callback: (...args: any[]) => R, ...args: any[]): R {
            this.#disabled = false
            this.#store.unshift(store)

            try {
                return callback(...args)
            } finally {
                this.#store.shift()
            }
        }

        public exit<R>(callback: (...args: any[]) => R, ...args: any[]): R {
            const saved = this.#store.shift()

            try {
                return callback(...args)
            } finally {
                saved !== undefined && this.#store.unshift(saved)
            }
        }

        public enterWith(store: T): void {
            // XXX: you need hooks into async resource lifecycles to implement this correctly
            this.#store.unshift(store)
        }
    }

type Metadata<P extends keyof Telemetry> = NonNullable<Parameters<Telemetry[P]>[0]>
type Metrics = { [P in keyof Telemetry as NameFromFunction<P>]: Metadata<P> }

export type MetricName = keyof Metrics

export class Metric<T extends MetricName = any> {
    private readonly state: Partial<Metrics[T]> = {}

    public constructor(public readonly name: T) {}

    public record<K extends keyof Metrics[T]>(key: K, value: Metrics[T][K]): void {
        if (value !== undefined) {
            this.state[key] ??= value
        }
    }

    public submit(): void {
        const metadata = Object.entries(this.state)
            .filter(([k]) => k !== 'passive')
            .map(([k, v]) => ({ Key: k, Value: String(v) }))

        globals.telemetry.record({
            Value: 1,
            Unit: 'None',
            Metadata: metadata,
            MetricName: this.name,
            Passive: this.state.passive ?? true,
            EpochTimestamp: (this.state.createTime ?? new globals.clock.Date()).getTime(),
        })

        delete Metric.store.getStore()?.[this.name]
    }

    private static readonly store = new AsyncLocalStorage<Record<MetricName, Metric | undefined>>()

    public static get<P extends MetricName>(name: P): Metric<P> {
        let metrics = this.store.getStore()
        if (metrics === undefined) {
            metrics = {} as Record<MetricName, Metric | undefined>
            this.store.enterWith(metrics)
        }

        return (metrics[name] ??= new this(name))
    }
}

type Telemetry = Omit<typeof telemetry, 'millisecondsSince'>
// hard-coded, need significant updates to the codgen to make these kinds of things easier
type Namespace =
    | 'vpc'
    | 'sns'
    | 'sqs'
    | 's3'
    | 'session'
    | 'schemas'
    | 'sam'
    | 'redshift'
    | 'rds'
    | 'lambda'
    | 'aws'
    | 'ecs'
    | 'ecr'
    | 'cdk'
    | 'apprunner'
    | 'dynamicresource'
    | 'toolkit'
    | 'cloudwatchinsights'
    | 'iam'
    | 'ec2'
    | 'dynamodb'
    | 'codecommit'
    | 'cloudwatchlogs'
    | 'beanstalk'
    | 'cloudfront'
    | 'apigateway'
    | 'vscode'
    | 'codewhisperer'
    | 'caws'

export type NameFromFunction<T extends keyof Telemetry> = T extends `record${infer P}`
    ? Uncapitalize<P> extends `${Namespace}${infer L}`
        ? Uncapitalize<P> extends `${infer N}${L}`
            ? `${N}_${Uncapitalize<L>}`
            : never
        : never
    : never
