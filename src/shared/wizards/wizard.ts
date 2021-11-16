/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branch, ControlSignal, StateMachineController, StepFunction } from './stateController'
import * as _ from 'lodash'
import { Prompter, PrompterConfiguration, PromptResult } from '../../shared/ui/prompter'
import { PrompterProvider, WizardForm } from './wizardForm'
import { WizardControl } from './util'

export interface StepEstimator<T> {
    (response: PromptResult<T>): number
}

// Persistent storage that exists on a per-property basis, side effects may occur here
export type StepCache = { picked?: any; response?: any; stepOffset?: [number, number] } & { [key: string]: any }
/**
 * @deprecated Will be removed in a future commit. The cache and estimator will only be exposed via `promptControl`.
 */
export type StateWithCache<TState, TProp = any> = TState & { stepCache: StepCache; estimator: StepEstimator<TProp> }

export interface WizardOptions<TState> {
    readonly initForm?: WizardForm<TState>
    readonly initState?: Partial<TState>
    readonly exitPrompter?: (state: TState) => Prompter<boolean>
    /** Provides a way to apply inputs to Prompters as if the user has already responded */
    readonly implicitState?: Partial<TState>
}

/**
 * A generic wizard that consumes data from a series of {@link Prompter prompters}. The 'form' public property
 * exposes functionality to add prompters to the wizard with optional context, utilizing the {@link WizardForm}
 * class. Wizards will modify a single property of their internal state with each prompt.
 */
export class Wizard<TState extends Partial<Record<keyof TState, unknown>>> {
    private readonly boundSteps: Map<string, StepFunction<TState>> = new Map()
    private readonly _form: WizardForm<TState>
    private caches: Record<string, StepCache> = {}
    private stateController: StateMachineController<TState>
    private _stepOffset: [number, number] = [0, 0]
    private exitStep?: StepFunction<TState>
    private running: boolean = false
    private activePrompter?: Prompter<any>

    public constructor(private readonly options: WizardOptions<TState> = {}) {
        this.stateController = new StateMachineController(options.initState as TState)
        this._form = options.initForm ?? new WizardForm()
        this.exitStep = options.exitPrompter !== undefined ? this.createExitStep(options.exitPrompter) : undefined
    }

    /**
     * The offset is applied to both the current step and total number of steps. Useful if the wizard is
     * apart of some overarching flow.
     */
    public set stepOffset(offset: [number, number]) {
        this._stepOffset = offset
    }
    public get currentStep(): number {
        return this._stepOffset[0] + this.stateController.currentStep
    }
    public get totalSteps(): number {
        return this._stepOffset[1] + this.stateController.totalSteps
    }

    public get form() {
        return this._form.body
    }

    /** The internal wizard form with bound prompters. This can be applied to other wizards. */
    public get boundForm() {
        return this._form
    }

    /** Retrives the internal cache of the wizard. Throws if the wizard is running. */
    public get cache() {
        if (this.running) {
            throw new Error('Cannot retrieve cache while wizard is running.')
        }
        return this.caches
    }
    /** Sets the internal cache of the wizard. Throws if the wizard is running. */
    public set cache(cache: Record<string, StepCache>) {
        if (this.running) {
            throw new Error('Cannot set cache while wizard is running.')
        }
        this.caches = cache
    }

    public get initialState() {
        return _.cloneDeep(this.options.initState)
    }

    private _estimator: ((state: TState) => number) | undefined
    public set parentEstimator(estimator: (state: TState) => number) {
        this._estimator = estimator
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
        this.running = true
        this.assignSteps()
        this.resolveNextSteps((this.options.initState ?? {}) as TState).forEach(step =>
            this.stateController.addStep(step)
        )

        const outputState = await this.stateController.run().finally(() => this.activePrompter?.dispose())
        this.running = false

        return outputState !== undefined ? this._form.applyDefaults(outputState, this.getAssigned()) : undefined
    }

    private createStepEstimator<TProp>(state: TState, prop: string): StepEstimator<TProp> {
        state = _.cloneDeep(state)

        return response => {
            if (response !== undefined && !WizardControl.isValidResponse(response)) {
                return 0
            }

            _.set(state, prop, response)
            const estimate = this.resolveNextSteps(state, new Set([prop])).length
            const parentEstimate = this._estimator !== undefined ? this._estimator(state) : 0
            _.set(state, prop, undefined)

            return estimate + parentEstimate
        }
    }

    private createExitStep(provider: NonNullable<WizardOptions<TState>['exitPrompter']>): StepFunction<TState> {
        return async state => {
            const prompter = (this.activePrompter = provider(state))
            const config = { steps: { current: this.currentStep, total: this.totalSteps } }
            const response = await prompter.promptControl(config)
            const didExit = response && [true, WizardControl.Exit, WizardControl.ForceExit].includes(response)

            return {
                nextState: state,
                controlSignal: didExit ? ControlSignal.Exit : ControlSignal.Back,
            }
        }
    }

    private createBoundStep<TProp>(prop: string, provider: PrompterProvider<TState, TProp, any>): StepFunction<TState> {
        let useImplied = Object.keys(this.caches).includes(prop)
        const stepCache = (this.caches[prop] ??= {})
        const impliedState = (stepCache.response = _.get(this.options.implicitState ?? {}, prop, stepCache.response))

        return async state => {
            const stateWithCache = Object.assign(
                { stepCache: stepCache, estimator: this.createStepEstimator(state, prop) },
                this._form.applyDefaults(state, this.getAssigned())
            )
            const impliedResponse = useImplied ? impliedState : undefined
            const response = await this.promptUser(stateWithCache, provider, impliedResponse)

            if (response === WizardControl.Exit && this.exitStep !== undefined) {
                return {
                    nextState: state,
                    nextSteps: [this.exitStep],
                }
            }

            const nextState = WizardControl.isValidResponse(response) ? _.set(state, prop, response) : state
            const nextSteps = this.resolveNextSteps(nextState)
            const controlSignal = response instanceof WizardControl ? response.type : undefined
            const isLastStep =
                nextSteps.length === 0 && this.stateController.currentStep === this.stateController.totalSteps

            if (useImplied && isLastStep) {
                useImplied = false
                return { controlSignal: WizardControl.Retry.type }
            }
            useImplied = false

            return { nextSteps, nextState, controlSignal }
        }
    }

    private getAssigned(): Set<string> {
        return new Set(
            [...this.boundSteps.keys()].filter(key => this.stateController.containsStep(this.boundSteps.get(key)!))
        )
    }

    protected resolveNextSteps(state: TState, assigned: Set<string> = this.getAssigned()): Branch<TState> {
        const nextSteps: Branch<TState> = []
        const currentlyAssigned = new Set(assigned)
        this.boundSteps.forEach((step, targetProp) => {
            if (
                !this.stateController.containsStep(step) &&
                this._form.canShowProperty(targetProp, state, currentlyAssigned)
            ) {
                nextSteps.push(step)
                currentlyAssigned.add(targetProp)
            }
        })
        return nextSteps
    }

    private async promptUser<TProp>(
        state: StateWithCache<TState, TProp>,
        provider: PrompterProvider<TState, TProp, any>,
        impliedResponse: TProp | undefined
    ): Promise<PromptResult<TProp>> {
        const prompter = (this.activePrompter = provider(state as StateWithCache<TState, TProp>))

        this._stepOffset = state.stepCache.stepOffset ?? this._stepOffset
        state.stepCache.stepOffset = this._stepOffset
        const config: PrompterConfiguration<TProp> = {
            cache: state.stepCache,
            stepEstimator: state.estimator,
            steps: { current: this.currentStep, total: this.totalSteps },
        }

        if (state.stepCache.picked !== undefined) {
            prompter.recentItem = state.stepCache.picked
        }

        const answer = impliedResponse === undefined ? await prompter.promptControl(config) : impliedResponse

        if (impliedResponse === undefined) {
            state.stepCache.picked = prompter.recentItem
        }
        if (!WizardControl.isValidResponse(answer)) {
            delete state.stepCache.stepOffset
        }

        state.stepCache.response = answer

        this._stepOffset = [
            this._stepOffset[0] + prompter.totalSteps - 1,
            this._stepOffset[1] + prompter.totalSteps - 1,
        ]

        return answer
    }
}
