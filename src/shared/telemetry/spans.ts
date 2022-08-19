/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

import type { AsyncLocalStorage as AsyncLocalStorageClass } from 'async_hooks'
import {
    definitions,
    Metadata,
    Metric,
    MetricBase,
    MetricDefinition,
    MetricName,
    MetricShapes,
    TelemetryBase,
} from './telemetry'
import { getTelemetryReason, getTelemetryResult } from '../errors'

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
                const result = callback(...args)
                if (result instanceof Promise) {
                    return result.finally(() => this.#store.shift()) as unknown as R
                }
                this.#store.shift()
                return result
            } catch (err) {
                this.#store.shift()
                throw err
            }
        }

        public exit<R>(callback: (...args: any[]) => R, ...args: any[]): R {
            const saved = this.#store.shift()

            try {
                const result = callback(...args)
                if (result instanceof Promise) {
                    return result.finally(() => saved !== undefined && this.#store.unshift(saved)) as unknown as R
                }
                saved !== undefined && this.#store.unshift(saved)
                return result
            } catch (err) {
                saved !== undefined && this.#store.unshift(saved)
                throw err
            }
        }

        public enterWith(store: T): void {
            // XXX: you need hooks into async resource lifecycles to implement this correctly
            this.#store.shift()
            this.#store.unshift(store)
        }
    }

function getValidatedState(state: Partial<MetricBase>, definition: MetricDefinition) {
    const missingFields: string[] = []

    for (const [k, v] of Object.entries(state)) {
        if (definition.requiredMetadata.includes(k) && v === undefined) {
            missingFields.push(k)
        }
    }

    if (missingFields.length !== 0) {
        return Object.assign({ missingFields }, state)
    }

    return { ...state }
}

export class TelemetrySpan {
    #startTime: Date | undefined = undefined
    private readonly state: Partial<MetricBase> = {}
    private readonly definition = definitions[this.name] ?? {
        unit: 'None',
        passive: true,
        requiredMetadata: [],
    }

    public constructor(public readonly name: string) {}

    public get startTime(): Date | undefined {
        return this.#startTime
    }

    public record(data: Partial<MetricBase>): this {
        Object.assign(this.state, data)
        return this
    }

    public emit(data?: MetricBase): void {
        const state = Object.assign(getValidatedState(this.state, this.definition), data)
        const metadata = Object.entries(state)
            .filter(([k, v]) => v !== undefined && !['passive', 'value'].includes(k))
            .map(([k, v]) => ({ Key: k, Value: String(v) }))

        globals.telemetry.record({
            Metadata: metadata,
            MetricName: this.name,
            Value: state.value ?? 1,
            Unit: this.definition.unit,
            Passive: state.passive ?? this.definition.passive,
            EpochTimestamp: (this.startTime ?? new globals.clock.Date()).getTime(),
        })
    }

    public start(): this {
        this.#startTime = new globals.clock.Date()
        return this
    }

    public stop(err?: unknown): void {
        const duration = this.startTime !== undefined ? globals.clock.Date.now() - this.startTime.getTime() : undefined

        this.emit({
            duration,
            result: getTelemetryResult(err),
            reason: getTelemetryReason(err),
        })

        this.#startTime = undefined
    }
}

interface TelemetryContext {
    readonly spans: TelemetrySpan[]
    readonly activeSpan?: TelemetrySpan
}

// This class is called 'Telemetry' but really it can be used for any kind of tracing
// You would need to make `Span` a template type and reduce the interface to just create/start/stop
export class TelemetryTracer extends TelemetryBase {
    readonly #context = new AsyncLocalStorage<TelemetryContext>()

    public get context() {
        return this.#context
    }

    public get spans(): readonly TelemetrySpan[] {
        return this.#context.getStore()?.spans ?? []
    }

    public get activeSpan(): TelemetrySpan | undefined {
        return this.#context.getStore()?.activeSpan
    }

    public record(data: Partial<MetricShapes[MetricName]>): void {
        this.activeSpan?.record(data)
    }

    public recordThrough(data: Partial<MetricShapes[MetricName]>): void {
        for (const span of this.spans) {
            span.record(data)
        }
    }

    public run<T, U extends MetricName>(name: U, fn: (span: Metric<MetricShapes[U]>) => T, data: MetricBase = {}): T {
        const span = this.getSpan(name).start().record(data)
        const frame = this.switchContext(span)

        try {
            const result = this.#context.run(frame, fn, span)

            if (result instanceof Promise) {
                return result
                    .then(v => (span.stop(), v))
                    .catch(e => {
                        span.stop(e)
                        throw e
                    }) as unknown as T
            }

            span.stop()
            return result
        } catch (e) {
            span.stop(e)
            throw e
        }
    }

    public instrument<T extends any[], U, R>(
        name: string,
        fn: (this: U, ...args: T) => R,
        data?: MetricBase
    ): (this: U, ...args: T) => R {
        const run = this.run.bind(this)

        return function (...args) {
            // Typescript's `bind` overloading doesn't work well for parameter types
            return run(name as MetricName, (fn as (this: U, ...args: any[]) => R).bind(this, ...args), data)
        }
    }

    protected getMetric(name: string): Metric {
        const getSpan = () => {
            const span = this.getSpan(name)
            if (!this.spans.includes(span)) {
                this.#context.enterWith({ ...this.#context.getStore(), spans: [span, ...this.spans] })
            }

            return span
        }

        return {
            name,
            emit: data => void getSpan().emit(data),
            record: data => void getSpan().record(data),
            run: fn => this.run(name as MetricName, fn),
        }
    }

    private getSpan(name: string): TelemetrySpan {
        const span = this.#context.getStore()?.spans.find(s => s.name === name)

        return span ?? new TelemetrySpan(name)
    }

    private switchContext(span: TelemetrySpan): TelemetryContext {
        const spans = [...(this.spans ?? [])]
        if (!spans.includes(span)) {
            spans.unshift(span)
        }

        return { spans, activeSpan: span }
    }
}

export const telemetry = new TelemetryTracer()

export function metric<T extends MetricName>(name: T, data?: Metadata<MetricShapes[T]>) {
    return function (_target: unknown, _name: string, desc: TypedPropertyDescriptor<(...args: any[]) => any>) {
        desc.value = telemetry.instrument(name, desc.value!, data)
    }
}
