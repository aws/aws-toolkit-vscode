/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branch, ControlSignal, StateMachineController, StepFunction } from './stateController'
import * as _ from 'lodash'
import { Prompter, PromptResult } from '../../shared/ui/prompter'
import { PrompterProvider, WizardForm } from './wizardForm'

/** Checks if the user response is valid (i.e. not undefined and not a control signal) */
export function isValidResponse<T>(response: PromptResult<T>): response is T {
    return response !== undefined && !isWizardControl(response)
}

type ObjectKeys<T> = {
    [Property in keyof T]: T[Property] extends Record<string, unknown> ? Property : never
}[keyof T]

type NonObjectKeys<T> = {
    [Property in keyof T]: T[Property] extends Record<string, unknown> ? never : Property
}[keyof T]

/**
 * Reserved type. Currently makes all object-like fields required and everything else
 * optional.
 */
export type WizardState<T> = {
    [Property in ObjectKeys<T>]-?: T[Property] extends Record<string, unknown>
        ? WizardState<Required<T[Property]>>
        : never
} &
    {
        [Property in NonObjectKeys<T>]+?: T[Property] extends Record<string, unknown> ? never : T[Property]
    }

// We use a symbol to safe-guard against collisions (alternatively this can be a class and use 'instanceof')
const WIZARD_CONTROL = Symbol()
const makeControlString = (type: string) => `[WIZARD_CONTROL] ${type}`

export const WIZARD_RETRY = {
    id: WIZARD_CONTROL,
    type: ControlSignal.Retry,
    toString: () => makeControlString('Retry'),
}
export const WIZARD_BACK = { id: WIZARD_CONTROL, type: ControlSignal.Back, toString: () => makeControlString('Back') }
export const WIZARD_EXIT = { id: WIZARD_CONTROL, type: ControlSignal.Exit, toString: () => makeControlString('Exit') }

/** Control signals allow for alterations of the normal wizard flow */
export type WizardControl = typeof WIZARD_RETRY | typeof WIZARD_BACK | typeof WIZARD_EXIT

export function isWizardControl(obj: any): obj is WizardControl {
    return obj !== undefined && obj.id === WIZARD_CONTROL
}

// Persistent storage that exists on a per-property basis, side effects may occur here
type StepCache = { picked?: any; stepOffset?: number } & { [key: string]: any }
export type StateWithCache<TState> = TState & { stepCache: StepCache }

/**
 * A generic wizard that consumes data from a series of 'prompts'. Wizards will modify a single property of
 * their internal state with each prompt. The 'form' public property exposes functionality to add prompters
 * with optional context.
 */
export class Wizard<TState extends Partial<Record<keyof TState, unknown>>> {
    private readonly boundSteps: Map<string, StepFunction<TState>> = new Map()
    private readonly _form: WizardForm<TState>
    private stateController: StateMachineController<TState>
    private _stepOffset: number = 0

    /**
     * The offset is applied to both the current step and total number of steps. Useful if the wizard is
     * apart of some overarching flow.
     */
    public set stepOffset(offset: number) {
        this._stepOffset = offset
    }
    public get currentStep(): number {
        return this._stepOffset + this.stateController.currentStep
    }
    public get totalSteps(): number {
        return this._stepOffset + this.stateController.totalSteps
    }

    public get form() {
        return this._form.body
    }

    public constructor(
        initForm: WizardForm<TState> = new WizardForm(),
        private readonly initState: Partial<TState> = {}
    ) {
        this.stateController = new StateMachineController(initState as TState)
        this._form = initForm
    }

    private assignSteps(): void {
        this._form.properties.forEach(prop => {
            const provider = this._form.getPrompterProvider(prop)
            if (!this.boundSteps.has(prop) && provider !== undefined) {
                this.boundSteps.set(prop, this.createBoundStep(prop, provider))
            }
        })
    }

    public async run(): Promise<TState | undefined> {
        this.assignSteps()
        this.resolveNextSteps(this.initState as TState).forEach(step => this.stateController.addStep(step))

        const outputState = await this.stateController.run()

        return outputState !== undefined ? this._form.applyDefaults(outputState) : undefined
    }

    private createBoundStep<TProp>(prop: string, provider: PrompterProvider<TState, TProp>): StepFunction<TState> {
        const stepCache: StepCache = {}

        return async state => {
            const stateWithCache = Object.assign({ stepCache: stepCache }, this._form.applyDefaults(state))
            const response = await this.promptUser(
                stateWithCache,
                provider(stateWithCache as StateWithCache<WizardState<TState>>)
            )

            return {
                nextState: isValidResponse(response) ? _.set(state, prop, response) : state,
                nextSteps: this.resolveNextSteps(state),
                controlSignal: isWizardControl(response) ? response.type : undefined,
            }
        }
    }

    protected resolveNextSteps(state: TState): Branch<TState> {
        const nextSteps: Branch<TState> = []
        const defaultState = this._form.applyDefaults(state)
        this.boundSteps.forEach((step, targetProp) => {
            if (
                this._form.canShowProperty(targetProp, state, defaultState) &&
                !this.stateController.containsStep(step)
            ) {
                nextSteps.push(step)
            }
        })
        return nextSteps
    }

    private async promptUser<TProp>(
        state: StateWithCache<TState>,
        prompter: Prompter<TProp>
    ): Promise<PromptResult<TProp>> {
        this._stepOffset = state.stepCache.stepOffset ?? this._stepOffset
        state.stepCache.stepOffset = this._stepOffset
        prompter.setSteps(this.currentStep, this.totalSteps)

        if (state.stepCache.picked !== undefined) {
            prompter.lastResponse = state.stepCache.picked
        }

        const answer = await prompter.prompt()

        if (isValidResponse(answer)) {
            state.stepCache.picked = prompter.lastResponse
        } else {
            delete state.stepCache.stepOffset
        }

        this._stepOffset = prompter.totalSteps - 1

        // Legacy code used 'undefined' to represent back, we will support the use-case
        // but moving forward wizard implementations will explicity use 'WIZARD_BACK'
        return answer ?? WIZARD_BACK
    }
}
