/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as _ from 'lodash'
import { getLogger } from '../logger/logger'

export interface StateMachineStepResult<TState> {
    nextState?: TState
    nextSteps?: StateStepFunction<TState>[]
}

type StepCache = { [key: string]: any }

export interface ExtendedState {
    currentStep: number
    totalSteps: number
    /**
     * Persistent information that exists on a per-step basis
     * This should not be used for determining state transitions as it would violate
     * the deterministic nature of the state machine
     */
    stepCache?: StepCache
}

type StateStepFunction<TState> = (state: MachineState<TState>) => Promise<StateMachineStepResult<TState> | TState>
type StateBranch<TState> = StateStepFunction<TState>[]
export type MachineState<TState> = TState & ExtendedState
/**
 * A multi-step wizard controller. Very fancy, very cool.
 */
export class StateMachineController<TState> {
    private previousStates: MachineState<TState>[] = []
    private stepCaches: WeakMap<StateStepFunction<TState>, StepCache | undefined> = new WeakMap()
    private extraSteps = new Map<number, StateBranch<TState>>()
    private steps: StateBranch<TState> = []
    private internalStep: number = 0
    private state!: MachineState<TState>

    public constructor(
        private readonly options: {
            initState?: TState | MachineState<TState>
            disableFutureMemory?: boolean
        } = {}
    ) {
        this.setState(options.initState)
    }

    public setState(state?: TState) {
        this.reset()
        this.state = { ...state } as MachineState<TState>
        this.state.currentStep = this.state.currentStep ?? 1
        this.state.totalSteps = (this.steps.length ?? 0) + (this.state.totalSteps ?? 0)
    }

    /**
     * Reset state so the controller can be resused.
     */
    public reset() {
        while (this.internalStep > 0) {
            this.rollbackState()
        }

        this.stepCaches = new WeakMap()
    }

    /** Adds a single step to the state machine. */
    public addStep(step: StateStepFunction<TState>): void {
        this.steps.push(step)
        this.state.totalSteps += 1
    }

    protected rollbackState(): void {
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

    protected advanceState(nextState: MachineState<TState>): void {
        this.stepCaches.set(this.steps[this.internalStep], this.state.stepCache)
        this.state = nextState
        this.state.stepCache = undefined
        this.internalStep += 1
        this.state.currentStep += 1
    }

    /**
     * Adds new steps to the state machine controller
     */
    protected dynamicBranch(nextSteps: StateBranch<TState> | undefined): void {
        if (nextSteps !== undefined && nextSteps.length > 0) {
            if (nextSteps.filter(step => this.stepCaches.has(step)).length !== 0) {
                throw Error('Cycle detected in state machine conroller')
            }
            this.steps.splice(this.internalStep, 0, ...nextSteps)
            this.extraSteps.set(this.internalStep, nextSteps)
            this.state.totalSteps += nextSteps.length
        }
    }

    protected async processNextStep(): Promise<StateMachineStepResult<TState>> {
        const result = await this.steps[this.internalStep](this.state)
        
        if ((result as StateMachineStepResult<TState>).nextSteps !== undefined) {
            return result
        } else {
            return { nextState: result as TState }
        }
    }

    /**
     * Runs the added steps until termination or failure
     */
    public async run(): Promise<TState | undefined> {
        while (this.internalStep < this.steps.length) {
            this.previousStates.push(_.cloneDeep(this.state))

            try {
                const { nextState, nextSteps } = await this.processNextStep()

                if (nextState === undefined) {
                    if (this.internalStep === 0) {
                        return undefined
                    }

                    this.rollbackState()
                } else {
                    this.advanceState(nextState as MachineState<TState>)
                    this.dynamicBranch(nextSteps)

                    if (this.options.disableFutureMemory !== true) {
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

        return this.state
    }
}