/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

import type { AsyncLocalStorage as AsyncLocalStorageClass } from 'async_hooks'
import {
    definitions,
    Metric,
    MetricBase,
    MetricDefinition,
    MetricName,
    MetricShapes,
    TelemetryBase,
} from './telemetry.gen'
import { getTelemetryReason, getTelemetryResult } from '../errors'
import { Mutable } from '../utilities/tsUtils'

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

    for (const key of definition.requiredMetadata) {
        if (state[key as keyof typeof state] === undefined) {
            missingFields.push(key)
        }
    }

    return missingFields.length !== 0 ? Object.assign({ missingFields }, state) : state
}

export class TelemetrySpan {
    #startTime: Date | undefined = undefined
    private readonly state: Partial<MetricBase> = {}
    private readonly definition = definitions[this.name] ?? {
        unit: 'None',
        passive: true,
        requiredMetadata: [],
    }

    /**
     * These fields appear on the base metric instead of the 'metadata' and
     * so they should be filtered out from the metadata.
     */
    static readonly #excludedFields = ['passive', 'value']

    public constructor(public readonly name: string) {}

    public get startTime(): Date | undefined {
        return this.#startTime
    }

    public record(data: Partial<MetricBase>): this {
        Object.assign(this.state, data)
        return this
    }

    public emit(data?: MetricBase): void {
        const state = getValidatedState({ ...this.state, ...data }, this.definition)
        const metadata = Object.entries(state)
            .filter(([_, v]) => v !== '') // XXX: the telemetry service currently rejects empty strings :/
            .filter(([k, v]) => v !== undefined && !TelemetrySpan.#excludedFields.includes(k))
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

    /**
     * Puts the span in a 'running' state.
     */
    public start(): this {
        this.#startTime = new globals.clock.Date()
        return this
    }

    /**
     * Immediately emits the span, adding a duration/result/reason to the final output if applicable.
     *
     * This places the span in a 'stopped' state but does not mutate the information held by the span.
     */
    public stop(err?: unknown): void {
        const duration = this.startTime !== undefined ? globals.clock.Date.now() - this.startTime.getTime() : undefined

        this.emit({
            duration,
            result: getTelemetryResult(err),
            reason: getTelemetryReason(err),
        })

        this.#startTime = undefined
    }

    /**
     * Creates a copy of the span with an uninitialized start time.
     */
    public clone(): TelemetrySpan {
        return new TelemetrySpan(this.name).record(this.state)
    }
}

interface TelemetryContext {
    readonly spans: TelemetrySpan[]
    readonly activeSpan?: TelemetrySpan
    readonly attributes?: Partial<MetricShapes[MetricName]>
}

// This class is called 'Telemetry' but really it can be used for any kind of tracing
// You would need to make `Span` a template type and reduce the interface to just create/start/stop
export class TelemetryTracer extends TelemetryBase {
    readonly #context = new AsyncLocalStorage<TelemetryContext>()

    /**
     * All spans present in the current execution context.
     */
    public get spans(): readonly TelemetrySpan[] {
        return this.#context.getStore()?.spans ?? []
    }

    /**
     * The most recently used span in the current execution context.
     *
     * Note that only {@link run} will change the active span. Recording information
     * on existing spans has no effect on the active span.
     */
    public get activeSpan(): TelemetrySpan | undefined {
        return this.#context.getStore()?.activeSpan
    }

    /**
     * All attributes set in the current execution context.
     */
    public get attributes(): NonNullable<TelemetryContext['attributes']> {
        return this.#context.getStore()?.attributes ?? {}
    }

    /**
     * Records information on all _current_ spans in the current execution context.
     *
     * This is merged in with the current state present in each span, **overwriting**
     * any existing values for a given key.
     */
    public record(data: Partial<MetricShapes[MetricName]>): void {
        for (const span of this.spans) {
            span.record(data)
        }
    }

    /**
     * Records information on all _future_ spans for the remainder of the execution context.
     *
     * This is merged with any existing attributes. Exiting a context will restore
     * `attributes` to its previous value.
     */
    public updateAttributes(data: TelemetryContext['attributes']): void {
        const ctx = this.#context.getStore()
        if (ctx === undefined) {
            this.#context.enterWith({ spans: [], attributes: data })
        } else {
            ;(ctx as Mutable<typeof ctx>).attributes = { ...ctx.attributes, ...data }
        }
    }

    /**
     * Executes the provided callback function with a named span.
     *
     * Spans that already exist in the current context are re-used and brought
     * forward, becoming the active span. A new span is created if none exist.
     *
     * On completion of the callback, the span is emitted and the context reverts
     * to how it was prior to calling `run`. Modifications made to pre-existing
     * spans within the execution are not preserved.
     */
    public run<T, U extends MetricName>(name: U, fn: (span: Metric<MetricShapes[U]>) => T): T {
        const span = this.getClonedSpan(name).record(this.attributes).start()
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

    /**
     * Wraps a function with {@link run}.
     *
     * This can be used when immediate execution of the function is not desirable.
     */
    public instrument<T extends any[], U, R>(name: string, fn: (this: U, ...args: T) => R): (this: U, ...args: T) => R {
        const run = this.run.bind(this)

        return function (...args) {
            // Typescript's `bind` overloading doesn't work well for parameter types
            return run(name as MetricName, (fn as (this: U, ...args: any[]) => R).bind(this, ...args))
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
            emit: data => this.getSpan(name).emit(data),
            record: data => void getSpan().record(data),
            run: fn => this.run(name as MetricName, fn),
        }
    }

    private getSpan(name: string): TelemetrySpan {
        return this.spans.find(s => s.name === name) ?? new TelemetrySpan(name).record(this.attributes)
    }

    private getClonedSpan(name: string): TelemetrySpan {
        return this.spans.find(s => s.name === name)?.clone() ?? new TelemetrySpan(name)
    }

    private switchContext(span: TelemetrySpan): TelemetryContext {
        const spans = [...this.spans]
        const previousSpanIndex = spans.findIndex(s => s.name === span.name)

        if (previousSpanIndex !== -1) {
            spans.splice(previousSpanIndex, 1, span)
        } else {
            spans.unshift(span)
        }

        return { spans, activeSpan: span }
    }
}
