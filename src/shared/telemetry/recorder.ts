/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as telemetry from './telemetry'
import { getLogger, Logger } from '../logger'
import { AsyncLocalStorage } from 'async_hooks'

const performance = globalThis.performance ?? require('perf_hooks')
const now = () => new Date(performance.now())

interface Metric<T> {
    start(): ActiveMetric<T>
    record(data: T): void
}

type ActiveMetric<T = unknown> = TelemetryRecorder<Required<T>> & Has<T> & { stop(this: T): void }

interface Has<T> {
    has<U, K extends keyof T>(this: U, ...props: K[]): this is U & { readonly [P in K]-?: T[P] }
}

interface TelemetryEvent<T = unknown> {
    readonly value: T
    readonly name: string
    readonly source: string
    readonly timestamp: Date
}

interface RecordFunction<T, K extends keyof T> {
    <U>(this: U, value: T[K]): U & { readonly [P in K]: T[P] }
}

type TelemetryRecorder<T> = {
    readonly [P in keyof T as `record${Capitalize<P & string>}`]: RecordFunction<T, P>
}

// This works fine for prototyping, but since we already codegen telemetry, we should generate
// the static calls as well to avoid `Proxy`

function createRecorder<T, U extends Record<string, any>>(
    inner: U,
    source: string,
    queue: TelemetryEvent[]
): U & TelemetryRecorder<T> {
    function uncapitalize(s: string): string {
        return `${s[0].toLowerCase()}${s.slice(1)}`
    }

    const proxy = new Proxy(inner, {
        get: (target, prop, receiver) => {
            if (typeof prop !== 'string') {
                throw new TypeError(`Invalid telemetry recorder key: ${String(prop)}`)
            }

            const name = uncapitalize(prop.replace('record', ''))

            if (!prop.startsWith('record')) {
                // We should find the last event with the same name but this works for now
                return Reflect.get(target, prop, receiver) ?? queue.find(e => e.name === name)
            }

            return <U>(value: U) => {
                queue.push({ value, source, name, timestamp: now() })
                Reflect.set(target, name, value, receiver)

                return proxy
            }
        },
    }) as U & TelemetryRecorder<T>

    return proxy
}

function startMetric<T>(id: string, record: (data: T) => void): ActiveMetric<T> {
    const queue = storage.getStore()?.telemetry.queue ?? []
    const createTime = now()

    function stop() {
        const result: Record<string, any> = { createTime }
        result.duration = Date.now() - createTime.getTime()

        for (const event of queue.filter(event => event.source === id)) {
            result[event.name] = event.value
        }

        // We are currently unable to do any validation here as it is implemented
        // inside the generated `record...` functions.
        record(result as T)
    }

    function has(this: Partial<T>, ...props: (keyof T)[]): boolean {
        return props.map(p => this[p] !== undefined).reduce((a, b) => a && b, true)
    }

    return createRecorder({ stop, record, has }, id, queue) as ActiveMetric<T>
}

type Telemetry = Omit<typeof telemetry, 'millisecondsSince'>
type RemoveRecord<T> = T extends `record${infer U}` ? U : T
type Metadata<P extends keyof Telemetry> = NonNullable<Parameters<Telemetry[P]>[0]>

type MappedMetrics = {
    [P in keyof Telemetry as RemoveRecord<P>]: Metric<Metadata<P>>
}

const metrics = {} as MappedMetrics

for (const [k, v] of Object.entries(telemetry)) {
    const name = k.replace('record', '') as keyof MappedMetrics
    const start = () => startMetric<any>(name, v)
    metrics[name] = { start } as any
}

interface ExecutionContext {
    readonly name: string
    readonly logger: Logger
    readonly telemetry: { readonly queue: TelemetryEvent[] }
}

const storage = new AsyncLocalStorage<ExecutionContext>()

/**
 * Runs a function with an {@link ExecutionContext}, containing context-specific observability
 * utilities such as telemetry and logging.
 */
export function run<F extends (...args: any[]) => any>(name: string, fn: F, ...args: Parameters<F>): ReturnType<F> {
    const context = {
        name,
        logger: getLogger(),
        telemetry: { queue: [] },
    }

    return storage.run(context, fn, ...args)
}

type TelemetryLogger = {
    [P in keyof Telemetry as RemoveRecord<P>]: TelemetryRecorder<Required<Metadata<P>>>
}

export type MetricName = keyof TelemetryLogger

export function getTelemetryLogger<T extends keyof TelemetryLogger>(metric: T): TelemetryLogger[T] {
    const queue = storage.getStore()?.telemetry?.queue ?? []

    return createRecorder({}, metric, queue) as TelemetryLogger[T]
}

export function instrument<T extends keyof TelemetryLogger, U extends (...args: any[]) => unknown>(
    metric: T,
    fn: U
): (...args: Parameters<U>) => ReturnType<U> {
    const start = (...args: Parameters<U>) => {
        type Base = Parameters<Telemetry['recordApigatewayCopyUrl']>[0]
        const activeMetric = metrics[metric].start() as unknown as ActiveMetric<Base>

        function handleFailed(error: unknown): never {
            if (!activeMetric.has('result')) {
                activeMetric.recordResult('Failed').stop()
            } else {
                activeMetric.stop()
            }

            throw error
        }

        function handleSuccess<T>(val: T): T {
            if (!activeMetric.has('result')) {
                activeMetric.recordResult('Succeeded').stop()
            } else {
                activeMetric.stop()
            }

            return val
        }

        try {
            const ret = fn(...args) as ReturnType<U>

            if (ret instanceof Promise) {
                return ret.then(handleSuccess).catch(handleFailed) as ReturnType<U>
            }

            return handleSuccess(ret)
        } catch (error) {
            handleFailed(error)
        }
    }

    return (...args) => run(metric, start, ...args)
}
