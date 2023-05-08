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
import { entries, NumericKeys } from '../utilities/tsUtils'

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

export class TelemetrySpan<T extends MetricBase = MetricBase> {
    #startTime: Date | undefined = undefined
    private readonly state: Partial<T> = {}
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

    public record(data: Partial<T>): this {
        Object.assign(this.state, data)
        return this
    }

    public emit(data?: Partial<T>): void {
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
        } as Partial<T>)

        this.#startTime = undefined
    }

    public increment(data: { [P in NumericKeys<T>]+?: number }): void {
        for (const [k, v] of entries(data)) {
            ;(this.state as Record<typeof k, number>)[k] = ((this.state[k] as number) ?? 0) + v!
        }
    }

    // TODO: implement copy-on-write abstraction if this method causes perf issues
    /**
     * Creates a copy of the span with an uninitialized start time.
     */
    public clone(): TelemetrySpan {
        return new TelemetrySpan(this.name).record(this.state)
    }
}

type Attributes = Partial<MetricShapes[MetricName]>

interface TelemetryContext {
    readonly spans: TelemetrySpan[]
    readonly attributes: Attributes
}

// This class is called 'Telemetry' but really it can be used for any kind of tracing
// You would need to make `Span` a template type and reduce the interface to just create/start/stop
export class TelemetryTracer extends TelemetryBase {
    readonly #context = new AsyncLocalStorage<TelemetryContext>()

    /**
     * `record` may be called prior to entering any span. This field simulates the
     * effect of having an ephemeral "root" span that only extends until we enter
     * an async context.
     */
    #syncAttributes: Attributes = {}

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
        return this.#context.getStore()?.spans[0]
    }

    /**
     * State that is applied to all new spans within the current or subsequent executions.
     */
    public get attributes(): Readonly<Attributes> {
        return this.#context.getStore()?.attributes ?? this.#syncAttributes
    }

    /**
     * Records information on all current and future spans in the execution context.
     *
     * This is merged in with the current state present in each span, **overwriting**
     * any existing values for a given key. New spans are initialized with {@link attributes}
     * but that may be overriden on subsequent writes.
     */
    public record(data: Attributes): void {
        for (const span of this.spans) {
            span.record(data)
        }

        Object.assign(this.attributes, data)
    }

    /**
     * Executes the provided callback function with a named span.
     *
     * All changes made to {@link attributes} (via {@link record}) during the execution are
     * reverted after the execution completes.
     */
    public run<T, U extends MetricName>(name: U, fn: (span: Metric<MetricShapes[U]>) => T): T {
        const span = this.createSpan(name).start()
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
        const getSpan = () => this.getSpan(name)

        return {
            name,
            emit: data => getSpan().emit(data),
            record: data => getSpan().record(data),
            run: fn => this.run(name as MetricName, fn),
            increment: data => getSpan().increment(data),
        }
    }

    private getSpan(name: string): TelemetrySpan {
        return this.spans.find(s => s.name === name) ?? this.createSpan(name)
    }

    private createSpan(name: string): TelemetrySpan {
        return new TelemetrySpan(name).record(this.attributes)
    }

    private switchContext(span: TelemetrySpan): TelemetryContext {
        const ctx = {
            spans: [span, ...this.spans],
            attributes: { ...this.attributes },
        }
        this.#syncAttributes = {}

        return ctx
    }
}
