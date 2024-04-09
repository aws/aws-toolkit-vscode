/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

/**
 * A span represents a "unit of work" captured for logging/telemetry.
 * It can contain other spans recursively, then it's called a "trace" or "flow".
 * https://opentelemetry.io/docs/concepts/signals/traces/
 *
 * See also: docs/telemetry.md
 */
export class TelemetrySpan<T extends MetricBase = MetricBase> {
    #startTime?: Date

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

    /**
     * Adds the values provided in {@link data} to the current state.
     *
     * Any `undefined` values are ignored. If the current {@link state} is `undefined` then the value
     * is initialized as 0 prior to adding {@link data}.
     */
    public increment(data: { [P in NumericKeys<T>]+?: number }): void {
        for (const [k, v] of entries(data)) {
            if (v !== undefined) {
                ;(this.state as Record<typeof k, number>)[k] = ((this.state[k] as number) ?? 0) + v
            }
        }
    }

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

const rootSpanName = 'root'

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
        return this.#context.getStore()?.spans[0]
    }

    /**
     * State that is applied to all new spans within the current or subsequent executions.
     */
    public get attributes(): Readonly<Attributes> | undefined {
        return this._attributes
    }

    private get _attributes(): Attributes | undefined {
        return this.#context.getStore()?.attributes
    }

    /**
     * Records information on the current and future spans in the execution context.
     *
     * This is merged in with the current state present in each span, **overwriting**
     * any existing values for a given key. New spans are initialized with {@link attributes}
     * but that may be overridden on subsequent writes.
     *
     * Callers must already be within an execution context for this to have any effect.
     */
    public record(data: Attributes): void {
        this.activeSpan?.record(data)

        if (this._attributes) {
            Object.assign(this._attributes, data)
        }
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
            //
            // TODO: Since updating to `@types/node@16`, typescript flags this code with error:
            //
            //      Error: npm ERR! src/shared/telemetry/spans.ts(255,57): error TS2345: Argument of type
            //      'TelemetrySpan<MetricBase>' is not assignable to parameter of type 'Metric<MetricShapes[U]>'.
            //
            const result = this.#context.run(frame, fn, span as any)

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
     * **You should use {@link run} in the majority of cases. Only use this for instrumenting extension entrypoints.**
     *
     * Executes the given function within an anonymous 'root' span which does not emit
     * any telemetry on its own.
     *
     * This can be used as a 'staging area' for adding attributes prior to creating spans.
     */
    public runRoot<T>(fn: () => T): T {
        const span = this.createSpan(rootSpanName)
        const frame = this.switchContext(span)

        return this.#context.run(frame, fn)
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
        const span = new TelemetrySpan(name).record(this.attributes ?? {})
        if (this.activeSpan && this.activeSpan.name !== rootSpanName) {
            return span.record({ parentMetric: this.activeSpan.name } satisfies { parentMetric: string } as any)
        }

        return span
    }

    private switchContext(span: TelemetrySpan): TelemetryContext {
        const ctx = {
            spans: [span, ...this.spans],
            attributes: { ...this.attributes },
        }

        return ctx
    }
}
