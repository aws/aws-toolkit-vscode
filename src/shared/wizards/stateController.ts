/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'

export enum StateMachineControl {
    Retry,
    Exit,
    Back,
}

export interface StateMachineStepResult<TState> {
    /** A mutated form of the present state. This will be passed along to the next step */
    nextState?: TState
    /** An array of step functions to be added immediately after the most recent step */
    nextSteps?: StateStepFunction<TState>[]
    /** Extra control instructions separate from the normal linear traversal of states */
    controlSignal?: StateMachineControl
}

/**
 * State machine transition function. Transforms the present state into a new one, which may also
 * include additional steps or control signals. The function can return the state directly if nothing
 * extra is needed.
 */
export type StateStepFunction<TState> = (state: TState) => Promise<StateMachineStepResult<TState> | TState>
export type StateBranch<TState> = StateStepFunction<TState>[]

/**
 * State machine with backtracking and dynamic branching functionality.
 * Transitions are abstracted away as a 'step' function, which return both the
 * new state and any extra steps that the machine should use.
 */
export class StateMachineController<TState> {
    private previousStates: TState[] = []
    private extraSteps = new Map<number, StateBranch<TState>>()
    private steps: StateBranch<TState> = []
    private internalStep: number = 0
    private state!: TState

    public constructor(private readonly initState: TState = {} as TState) {
        this.setState(this.initState)
    }

    public setState(state: TState) {
        this.state = state
    }

    /** Adds a single step to the state machine. */
    public addStep(step: StateStepFunction<TState>): void {
        this.steps.push(step)
    }

    public containsStep(step: StateStepFunction<TState> | undefined): boolean {
        return step !== undefined && this.steps.indexOf(step) > -1
    }

    public get currentStep(): number { return this.internalStep + 1 }
    public get totalSteps(): number { return this.steps.length }

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

    protected advanceState(nextState: TState): void {
        this.previousStates.push(_.cloneDeep(this.state))
        this.state = nextState
        this.internalStep += 1
    }

    protected detectCycle(step: StateStepFunction<TState>): TState | undefined {
        return this.previousStates.find((pastState, index) => index !== this.internalStep && 
            (this.steps[index] === step && _.isEqual(this.state, pastState)))
    }

    /**
     * Add new steps dynamically at runtime. Only used internally.
     */
    protected dynamicBranch(nextSteps: StateBranch<TState> | undefined): void {
        if (nextSteps !== undefined && nextSteps.length > 0) {
            this.steps.splice(this.internalStep, 0, ...nextSteps)
            this.extraSteps.set(this.internalStep, nextSteps)
        }
    }

    protected async processNextStep(): Promise<StateMachineStepResult<TState>> {
        const result = await this.steps[this.internalStep](this.state)

        function isMachineResult(result: any): result is StateMachineStepResult<TState> {
            return (result !== undefined && 
                (result.nextState !== undefined || result.nextSteps !== undefined || result.controlSignal !== undefined))
        }

        if (isMachineResult(result)) {
            return result
        } else {
            return { nextState: result }
        }
    }

    /**
     * Runs the added steps until termination or failure
     */
    public async run(): Promise<TState | undefined> {
        this.previousStates.push(_.cloneDeep(this.state))

        while (this.internalStep < this.steps.length) {
            const cycle = this.detectCycle(this.steps[this.internalStep]) 
            if (cycle !== undefined) {
                throw Error('Cycle detected in state machine controller: '
                    + `Step ${this.currentStep} -> Step ${this.previousStates.indexOf(cycle)+1}`)
            }

            const { nextState, nextSteps, controlSignal } = await this.processNextStep()

            if (controlSignal === StateMachineControl.Exit) {
                return undefined
            } if (controlSignal === StateMachineControl.Retry) {
                this.state = this.previousStates[this.internalStep - 1]
                continue
            } else if (nextState === undefined || controlSignal === StateMachineControl.Back) {
                if (this.internalStep === 0) {
                    return undefined
                }

                this.rollbackState()
            } else {
                this.advanceState(nextState)
                this.dynamicBranch(nextSteps)
            }
        }

        return this.state
    }
}