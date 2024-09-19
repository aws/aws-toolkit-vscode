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
import {
    getHttpStatusCode,
    getRequestId,
    getTelemetryReason,
    getTelemetryReasonDesc,
    getTelemetryResult,
} from '../errors'
import { entries, NumericKeys } from '../utilities/tsUtils'
import { PerformanceTracker } from '../performance/performance'
import { randomUUID } from '../crypto'

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
 * Options used for the creation of a span
 */
export type SpanOptions = {
    /** True if this span should emit its telemetry events. Defaults to true if undefined. */
    emit?: boolean

    /**
     * Adds a function entry to the span stack.
     *
     * This allows you to eventually retrieve the function entry stack by using {@link TelemetryTracer.getFunctionStack()},
     * which tells you the chain of function executions to bring you to that point in the code.
     *
     * Example:
     * ```
     * function a() {
     *   telemetry.your_Metric.run(() => b(), { functionId: { name: 'a'} })
     * }
     *
     * function b() {
     *   telemetry.your_Metric.run(() => c(), { functionId: { name: 'b'} })
     * }
     *
     * function c() {
     *   telemetry.your_Metric.run(() => {
     *     const stack = telemetry.getFunctionStack()
     *     console.log(stack) // [ {source: 'a' }, { source: 'b' }, { source: 'c' }]
     *   }, { functionId: { name: 'c'} })
     * }
     * ```
     */
    functionId?: FunctionEntry
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
    #options: SpanOptions & {
        trackPerformance: boolean
    }
    #performance?: PerformanceTracker

    private readonly state: Partial<T> = {}
    private readonly definition = definitions[this.name] ?? {
        unit: 'None',
        passive: true,
        requiredMetadata: [],
    }
    private readonly metricId: string

    /**
     * These fields appear on the base metric instead of the 'metadata' and
     * so they should be filtered out from the metadata.
     */
    static readonly #excludedFields = ['passive', 'value']

    public constructor(
        public readonly name: string,
        options?: SpanOptions
    ) {
        // set defaults on undefined options
        this.#options = {
            // do emit by default
            emit: options?.emit === undefined ? true : options.emit,
            functionId: options?.functionId,
            trackPerformance: PerformanceTracker.enabled(
                this.name,
                this.definition.trackPerformance && (options?.emit ?? false) // only track the performance if we are also emitting
            ),
        }

        this.metricId = randomUUID()
        // forced to cast to any since apparently even though <T extends MetricBase>, Partial<T> doesn't guarentee that metricId is available
        this.record({ metricId: this.metricId } as any)
    }

    public get startTime(): Date | undefined {
        return this.#startTime
    }

    public record(data: Partial<T>): this {
        Object.assign(this.state, data)
        return this
    }

    public getFunctionEntry(): Readonly<FunctionEntry> | undefined {
        return this.#options.functionId
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
        if (this.#options.trackPerformance) {
            ;(this.#performance ??= new PerformanceTracker(this.name)).start()
        }

        return this
    }

    /**
     * Immediately emits the span, adding a duration/result/reason to the final output if applicable.
     *
     * This places the span in a 'stopped' state but does not mutate the information held by the span.
     */
    public stop(err?: unknown): void {
        const duration = this.startTime !== undefined ? globals.clock.Date.now() - this.startTime.getTime() : undefined

        if (this.#options.trackPerformance) {
            // TODO add these to the global metrics, right now it just forces them in the telemetry and ignores the type
            // if someone enables this action
            const performanceMetrics = this.#performance?.stop()
            if (performanceMetrics) {
                this.record({
                    userCpuUsage: performanceMetrics.userCpuUsage,
                    systemCpuUsage: performanceMetrics.systemCpuUsage,
                    heapTotal: performanceMetrics.heapTotal,
                    functionName: this.#options.functionId?.name ?? this.name,
                    architecture: process.arch,
                } as any)
            }
        }

        if (this.#options.emit) {
            this.emit({
                duration,
                result: getTelemetryResult(err),
                reason: getTelemetryReason(err),
                reasonDesc: getTelemetryReasonDesc(err),
                requestId: getRequestId(err),
                httpStatusCode: getHttpStatusCode(err),
            } as Partial<T>)
        }

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

    getMetricId() {
        return this.metricId
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
    public run<T, U extends MetricName>(name: U, fn: (span: Metric<MetricShapes[U]>) => T, options?: SpanOptions): T {
        const initTraceId = (callback: () => T): T => {
            /**
             * Generate a new traceId if one doesn't exist.
             * This ensures the traceId is created before the span,
             * allowing it to propagate to all child telemetry metrics.
             */
            if (!this.attributes?.traceId) {
                return this.runRoot(() => {
                    this.record({ traceId: randomUUID() })
                    return callback()
                })
            }
            return callback()
        }

        return initTraceId(() => {
            const span = this.createSpan(name, options).start()
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
                        .then((v) => (span.stop(), v))
                        .catch((e) => {
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
        })
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
     * Returns the stack of all {@link FunctionEntry}s with the 0th
     * index being the top level call, and the last index being the final
     * nested call.
     *
     * Ensure that there are uses of {@link TelemetryTracer.run()} with {@link SpanOptions.functionId}
     * before this method is called, otherwise it will return no useful information.
     *
     * Use {@link asStringifiedStack} to create a stringified version of this stack.
     */
    public getFunctionStack(): FunctionEntry[] {
        const stack: FunctionEntry[] = []
        const endIndex = this.spans.length - 1
        let i = endIndex
        while (i >= 0) {
            const span = this.spans[i]
            const entry = span.getFunctionEntry()
            if (entry) {
                stack.push(entry)
            }
            i -= 1
        }
        return stack
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
            emit: (data) => getSpan().emit(data),
            record: (data) => getSpan().record(data),
            run: (fn, options?: SpanOptions) => this.run(name as MetricName, fn, options),
            increment: (data) => getSpan().increment(data),
        }
    }

    private getSpan(name: string): TelemetrySpan {
        return this.spans.find((s) => s.name === name) ?? this.createSpan(name)
    }

    private createSpan(name: string, options?: SpanOptions): TelemetrySpan {
        const span = new TelemetrySpan(name, options).record(this.attributes ?? {})
        if (this.activeSpan && this.activeSpan.name !== rootSpanName) {
            return span.record({ parentId: this.activeSpan.getMetricId() })
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

/**
 * A Function Entry is a single entry in to a stack of Function Entries.
 *
 * Think of a Function Entry as one entry in the stack trace of an Error.
 * So a stack of Function Entries will allows you to build a path of functions.
 * This can allow you to trace the path of executions.
 *
 * In MOST cases, a Function Entry will represent a method/function call, but it is not
 * limited to that.
 */
export type FunctionEntry = {
    /**
     * An identifier that represents the callback. You'll probably want to use the function name.
     */
    readonly name: string

    /**
     * If the source is a method, you'll want to include the class name for better context.
     */
    readonly class?: string
}

/**
 * Returns a stringified version of the provided {@link ExecutionContext.stack}.
 *
 * Eg: "TestClassA1#methodA,methodB:TestClassA2#methodX,methodY,thisIsAlsoZ:someFunction"
 *
 *   - '#' separates a class from its methods
 *   - ',' separates methods of the same class
 *   - ':' separates classes/functions
 *   - The call stack goes in order from left to right
 *   - The first item in the string is the top level, initial caller in the stack
 *   - The last item is the final caller in the stack
 *
 * See tests for examples.
 */
export function asStringifiedStack(stack: FunctionEntry[]): string {
    let prevEntry: FunctionEntry | undefined
    let currString: string = ''

    // Iterate over each entry, appending the source and class to the final output string
    for (const currEntry of stack) {
        const prevClass = prevEntry?.class
        const newClass = currEntry.class

        if (prevClass && prevClass === newClass) {
            // The new class is same as the prev class, so we don't need to add the class since it already exists
            currString = `${currString},${currEntry.name}`
        } else {
            // The new class may be different from the prev class, so start a new subsection, adding the new class if it exists.
            currString = `${currString ? currString + ':' : ''}${newClass ? newClass + '#' : ''}${currEntry.name}`
        }

        prevEntry = currEntry
    }

    return currString
}
