/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as _ from 'lodash'
export interface StateMachineStepResult<TState> {
    /**
     * The next state the controller should use for future steps.
     */
    nextState?: TState
    /**
     * Additional steps that should be added to the controller. Ignored if nextState is undefined.
     */
    nextSteps?: StateStepFunction<TState>[]
    /**
     * Repeats the current step. Ignores the next state if provided.
     */
    repeatStep?: boolean
}

type RecursiveReadonly<T> = {
    readonly [Property in keyof T]: RecursiveReadonly<T[Property]> 
}

export type StateStepFunction<TState> = (state: TState) => Promise<StateMachineStepResult<TState> | TState>
export type StateBranch<TState> = StateStepFunction<TState>[]

export const WIZARD_GOBACK = undefined
export const WIZARD_RETRY = { repeatStep: true }

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

    public constructor(private readonly initState?: TState) {
        this.setState(this.initState)
    }

    public setState(state?: TState) {
        this.reset()
        this.state = state ?? {} as TState
    }

    public getState(): RecursiveReadonly<TState> {
       return this.state
    }

    /**
     * Reset state so the controller can be resused.
     */
    public reset() {
        while (this.internalStep > 0) {
            this.rollbackState()
        }
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

    /**
     * Add new steps dynamically at runtime. Only used internally.
     */
    protected dynamicBranch(nextSteps: StateBranch<TState> | undefined): void {
        if (nextSteps !== undefined && nextSteps.length > 0) {
            // This cycle detect logic could be improved. Returning to
            // a previous step is not a cycle unless the states are equivalent.
            if (nextSteps.filter(step => this.containsStep(step)).length !== 0) {
                throw Error('Cycle detected in state machine conroller')
            }
            this.steps.splice(this.internalStep, 0, ...nextSteps)
            this.extraSteps.set(this.internalStep, nextSteps)
        }
    }

    protected async processNextStep(): Promise<StateMachineStepResult<TState>> {
        const result = await this.steps[this.internalStep](this.state)

        function isMachineResult(result: any): result is StateMachineStepResult<TState> {
            return result !== undefined && 
                (result.nextState !== undefined || result.nextSteps !== undefined || result.repeatStep !== undefined)
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
            const { nextState, nextSteps, repeatStep } = await this.processNextStep()

            if (repeatStep === true) {
                continue
            } if (nextState === undefined) {
                if (this.internalStep === 0) {
                    return undefined
                }

                this.rollbackState()
            } else {
                this.advanceState(nextState as TState)
                this.dynamicBranch(nextSteps)
            }
        }

        return this.state
    }
}