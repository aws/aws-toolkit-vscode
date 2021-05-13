/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as _ from 'lodash'
import { getLogger } from '../logger/logger'

export interface StateMacineStep<TState> {
    nextState?: TState
    nextSteps?: StateStepFunction<TState>[]
}

type StepCache = { [key: string]: any }

export interface ExtendedMachineState {
    currentStep: number
    totalSteps: number
    /**
     * Persistent information that exists on a per-step basis
     * This should not be used for determining state transitions as it would violate
     * the deterministic nature of the state machine
     */
    stepCache?: StepCache
}

export type StateStepFunction<TState> = (state: TState) => Promise<StateMacineStep<TState>>
export type StateBranch<TState> = StateStepFunction<MachineState<TState>>[]
export type MachineState<TState> = TState & ExtendedMachineState
/**
 * A multi-step wizard controller. Very fancy, very cool.
 */
export class StateMachineController<TState, TResult> {
    private previousStates: MachineState<TState>[] = []
    private stepCaches: WeakMap<StateStepFunction<MachineState<TState>>, StepCache | undefined> = new WeakMap()
    private extraSteps = new Map<number, StateBranch<TState>>()
    private steps: StateBranch<TState> = []
    private internalStep: number = 0
    private state!: MachineState<TState>
    private finalState: MachineState<TState> | undefined
    private machineResets: (() => void)[] = []

    public constructor(
        private outputResult: (state: MachineState<TState>) => TResult,
        private readonly options: {
            initState?: TState | MachineState<TState>
            disableFutureMemory?: boolean
        } = {}
    ) {
        this.setState(options.initState)
    }

    public setState<AltTState>(state?: AltTState) {
        this.state = { ...state } as MachineState<TState>
        this.state.currentStep = this.state.currentStep ?? 1
        this.state.totalSteps = (this.steps.length ?? 0) + (this.state.totalSteps ?? 0)
    }

    /**
     * Resets state so the controller can be resused.
     */
    public reset() {
        this.state = this.previousStates[0]
        this.previousStates = this.previousStates.slice(0, 1)
        this.internalStep = 0
        this.extraSteps.clear()
        this.stepCaches = new WeakMap()
        this.machineResets.map(f => f())
    }

    public addStep(step: StateStepFunction<MachineState<TState>>): void

    public addStep<AltTState, AltTResult>(
        machine: StateMachineController<AltTState, AltTResult>,
        nextState: (state: MachineState<AltTState>, result: AltTResult | undefined) => MachineState<TState>,
        nextSteps: (
            state: MachineState<AltTState>,
            result: AltTResult | undefined
        ) => StateStepFunction<MachineState<TState>>[]
    ): void

    /** Adds a single step to the state machine. A step can also be another state machine. */
    public addStep<AltTState = TState, AltTResult = TResult>(
        step:
            | StateStepFunction<MachineState<TState>>
            | StateStepFunction<MachineState<TState>>
            | StateMachineController<AltTState, AltTResult>,
        nextState?: (state: MachineState<AltTState>, result: AltTResult | undefined) => MachineState<TState>,
        nextSteps?: (
            state: MachineState<AltTState>,
            result: AltTResult | undefined
        ) => StateStepFunction<MachineState<TState>>[]
    ): void {
        if (typeof step === 'function') {
            this.steps.push(step)
        } else if (typeof step === 'object' && step.internalStep !== undefined) {
            this.steps.push(async state => {
                step.setState(state)
                step.rollback()
                const result = await step.run()
                const finalState = step.finalState
                if (finalState !== undefined) {
                    finalState.currentStep -= 1
                    finalState.totalSteps -= 1
                    return {
                        nextState: nextState!(finalState, result),
                        nextSteps: nextSteps!(finalState, result),
                    }
                } else {
                    return { nextState: undefined }
                }
            })
            this.machineResets.push(() => step.reset())
        } else {
            throw Error('Invalid state machine step')
        }
        this.state.totalSteps += 1
    }

    public getFinalState(): MachineState<TState> | undefined {
        return this.finalState ? _.cloneDeep(this.finalState) : undefined
    }

    public rollback(): void {
        if (this.internalStep === 0) {
            return
        }

        if (this.extraSteps.has(this.internalStep)) {
            this.steps.splice(this.internalStep, this.extraSteps.get(this.internalStep)!.length)
            this.extraSteps.delete(this.internalStep)
        }

        this.state = this.previousStates.pop()!
        this.internalStep -= 1
    }

    /**
     * Adds new steps to the state machine controller
     */
    private dynamicBranch(nextSteps: StateBranch<TState> | undefined): void {
        if (nextSteps !== undefined && nextSteps.length > 0) {
            if (nextSteps.filter(step => this.stepCaches.has(step)).length !== 0) {
                throw Error('Cycle detected in state machine conroller')
            }
            this.steps.splice(this.internalStep, 0, ...nextSteps)
            this.extraSteps.set(this.internalStep, nextSteps)
            this.state.totalSteps += nextSteps.length
        }
    }

    /**
     * Runs the added steps until termination or failure
     */
    public async run(): Promise<TResult | undefined> {
        if (this.previousStates.length === 0) {
            this.previousStates.push(_.cloneDeep(this.state))
        }
        this.finalState = undefined

        while (this.internalStep < this.steps.length) {
            try {
                const stepOutput = await this.steps[this.internalStep](this.state)

                if (stepOutput.nextState === undefined) {
                    if (this.internalStep === 0) {
                        return undefined
                    }

                    this.rollback()
                } else {
                    this.stepCaches.set(this.steps[this.internalStep], this.state.stepCache)
                    this.previousStates.push(_.cloneDeep(stepOutput.nextState))
                    this.state = stepOutput.nextState
                    this.state.stepCache = undefined
                    this.internalStep += 1
                    this.state.currentStep += 1

                    this.dynamicBranch(stepOutput.nextSteps)

                    if (this.options.disableFutureMemory !== true) {
                        // future cache
                        this.state.stepCache = this.stepCaches.get(this.steps[this.internalStep])
                    }
                }
            } catch (err) {
                getLogger().debug(
                    'state machine controller: terminated due to unhandled exception with current state %O',
                    this.state
                )
                throw err
            }
        }

        const result = this.getResult()
        this.finalState = this.state

        return result
    }

    private getResult(): TResult {
        return this.outputResult(this.state)
    }
}
