/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// This file is mostly for keeping telemetry code separate from the core wizard code
import * as _ from 'lodash'
import { ControlSignal } from './stateController'

interface TraceData {
    prop: string
    result: any
    duration: number
    totalSteps: number
    currentStep: number
}

interface ResultBase {
    type: 'Completed' | 'Failed' | 'Cancelled'
    duration: number
    uniqueSteps: number
    totalPrompts: number
}

interface TraceCompleted<TState> extends ResultBase {
    type: 'Completed'
    state: TState
}

interface TraceFailed extends ResultBase {
    type: 'Failed'
    reason: string | Error
    prop: string
}

interface TraceCancelled extends ResultBase {
    type: 'Cancelled'
    prop: string
    furthestStep: string
}

interface TraceReporter {
    stop: (result: any) => void
}

export type WizardTraceResult<TState> = TraceCompleted<TState> | TraceFailed | TraceCancelled

export class WizardTrace<TState> {
    private readonly datum: TraceData[] = []
    private finalState?: TState

    constructor(private readonly initialState: Partial<TState>) {}

    public static instrumentPromise<T>(reporter: TraceReporter, promise: Promise<T>): Promise<T> {
        return promise
            .then(result => (reporter.stop(result), result))
            .catch(err => {
                reporter.stop(err)
                throw err
            })
    }

    public start(prop: string, currentStep: number, totalSteps: number): TraceReporter {
        const startTime = Date.now()

        return {
            stop: result => {
                this.datum.push({ prop, result, currentStep, totalSteps, duration: Date.now() - startTime })
            },
        }
    }

    public build(): WizardTraceResult<TState> {
        const error = this.parseError()
        const type = this.finalState !== undefined ? 'Completed' : error ? 'Failed' : 'Cancelled'
        const prop = error?.prop ?? this.datum.slice(-1)[0].prop
        const furthestStep = this.furthestStep()
        const durations = this.propDuration()
        const reason = error?.result ?? ''
        const base = {
            duration: this.totalDuration(),
            totalPrompts: this.datum.length,
            uniqueSteps: Object.keys(durations).length,
        }

        if (type === 'Completed') {
            return { ...base, type, state: this.finalState! }
        } else if (type === 'Failed') {
            return { ...base, type, prop, reason }
        }

        return { ...base, prop, type, furthestStep }
    }

    public get state(): Record<number, Partial<TState>> {
        const state: Record<number, Partial<TState>> = {}

        this.datum.forEach((_, index) => {
            Object.defineProperty(state, index, {
                get: () => this.constructState(this.datum.slice(index)),
            })
        })

        return state
    }

    public complete(state: TState) {
        this.finalState = state
    }

    private parseError(): (TraceData & { result: Error }) | undefined {
        return this.datum.find(d => d.result instanceof Error)
    }

    private totalDuration(): number {
        return this.datum.map(d => d.duration).reduce((a, b) => a + b, 0)
    }

    private propDuration(): Record<string, number> {
        return this.datum
            .map(d => [d.prop, d.duration] as [string, number])
            .reduce((a, b) => ((a[b[0]] += b[1]), a), {} as Record<string, number>)
    }

    private furthestStep(): string {
        return (
            Array(...this.datum)
                .sort((a, b) => a.currentStep - b.currentStep)
                .pop()?.prop ?? '[[None]]'
        )
    }

    private constructState(datum: TraceData[]): Partial<TState> {
        const state = _.cloneDeep(this.initialState)
        const convertResult = (result: any) =>
            result instanceof WizardControl || result instanceof Error ? undefined : result

        return datum
            .map(d => d.result)
            .filter(d => !(d instanceof WizardControl && [ControlSignal.Retry, ControlSignal.Exit].includes(d.type)))
            .filter((d, i, arr) => !(d instanceof WizardControl || arr[i + 1] instanceof WizardControl))
            .reduce((a, b) => _.set(a, b.path, convertResult(b.result)), state)
    }
}

/** Control signals allow for alterations of the normal wizard flow */
export class WizardControl {
    constructor(public readonly type: ControlSignal) {}
    public toString() {
        return `[WIZARD_CONTROL] ${this.type}`
    }
}

export class WizardError<TState> extends Error {
    constructor(error: Error, trace: WizardTrace<TState>, public readonly result = trace.build()) {
        super(result.type === 'Failed' ? `Wizard failure: ${result.prop} -> ${result.reason}` : error.message)
    }
}
