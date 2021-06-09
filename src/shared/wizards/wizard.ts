/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { StateBranch, StateMachineControl, StateMachineController, StateMachineStepResult, StateStepFunction } from './stateController'
import * as vscode from 'vscode'
import * as _ from 'lodash'
import { Prompter, PromptResult } from '../../shared/ui/prompter'

interface ContextOptions<TState, TProp> {
    /**
     * Applies a conditional function that is evaluated after every user-input if the property
     * is undefined or if the property is not queued up to be prompted. Upon returning true, the 
     * bound property will be added to the prompt queue.
     */
    showWhen?: (state: WizardSchema<TState>) => boolean
    /**
     * Sets a default value for the response form if it is undefined after the wizard terminates.
     */
    setDefault?: (state: WizardSchema<TState>) => TProp | undefined
    /**
     * If set to true the wizard will ignore prompting for already assigned properties
     */
    implicit?: boolean // unimplemented
}

type ObjectKeys<T> = {
    [Property in keyof T]: T[Property] extends Record<string, unknown> ? Property : never
}[keyof T]

type NonObjectKeys<T> = {
    [Property in keyof T]: T[Property] extends Record<string, unknown> ? never : Property
}[keyof T]

/**
 * Any property with sub-properties becomes a required element, while everything else
 * becomes optional. This is applied recursively.
 */
export type WizardSchema<T> = {
    [Property in ObjectKeys<T>]-?: T[Property] extends Record<string, unknown> ? 
        WizardSchema<T[Property]> : never
} & {
    [Property in NonObjectKeys<T>]+?: T[Property] extends Record<string, unknown> ? 
        never : T[Property]
}

export type WizardQuickPickItem<T> =  T extends string 
    ? vscode.QuickPickItem & { metadata?: string | symbol | (() => Promise<string | symbol>) }
    : vscode.QuickPickItem & { metadata: T | symbol | (() => Promise<T | symbol>) }

// We use a symbol to safe-guard against collisions
const WIZARD_CONTROL = Symbol()

export const WIZARD_RETRY = { id: WIZARD_CONTROL, type: StateMachineControl.Retry }
export const WIZARD_BACK = { id: WIZARD_CONTROL, type: StateMachineControl.Back }
export const WIZARD_EXIT = { id: WIZARD_CONTROL, type: StateMachineControl.Exit }

export type WizardControl = typeof WIZARD_RETRY | typeof WIZARD_BACK | typeof WIZARD_EXIT

export function isWizardControl(obj: any): obj is WizardControl {
    return obj !== undefined && obj.id === WIZARD_CONTROL
}

function nullChildren(obj: any): boolean {
    return typeof obj === 'object' && Object.keys(obj).every(key => obj[key] === undefined)
}

type PrompterBind<TProp, TState> = (getPrompter: (state: StateWithCache<TState>) => 
    Prompter<TProp>, options?: ContextOptions<TState, TProp>) => void

interface WizardFormElement<TProp, TState> {
    /**
     * Binds a Prompter provider to the specified property. The provider is called whenever the property is ready for 
     * input, and should return a Prompter object.
     */
    readonly bindPrompter: PrompterBind<NonNullable<TProp>, TState>
}

/**
 * Transforms an interface into a collection of WizardFormElements
 */
type WizardForm<T, TState=T> = {
    [Property in keyof T]-?: T[Property] extends Record<string, unknown> 
        ? (WizardForm<T[Property], TState> & WizardFormElement<T[Property], TState>)
        : WizardFormElement<T[Property], TState>
}

type RecursivePartial<T> = { [Property in keyof T]+?: RecursivePartial<T[Property]> }

// Persistent storage that exists on a per-property basis
type StepCache = { picked?: any } & { [key: string]: any }
type StateWithCache<TState> = TState & { stepCache: StepCache }

type StepWithContext<TState, TProp> = ContextOptions<TState, TProp> & { boundStep: StateStepFunction<TState> }

// TODO: make wizard not extend from this class. testing would be easier if we can just inject data into the wizard?
/**
 * A generic wizard that consumes data from a series of 'prompts'. Wizards will modify a single property of
 * their internal state with each prompt. Classes that extend this base class can assign Prompters to individual
 * properties by using the internal 'form' object. 
 */
export abstract class Wizard<TState extends Partial<Record<keyof TState, unknown>>, TResult=TState> {
    private readonly formData = new Map<string, StepWithContext<TState, any>>()
    protected readonly form!: WizardForm<TState> 
    private readonly stateController!: StateMachineController<TState>
    private nextPromptEventEmitter = new vscode.EventEmitter<Prompter<any>>()
    public onNextPrompt: vscode.Event<Prompter<any>> = this.nextPromptEventEmitter.event

    public constructor(private readonly schema: WizardSchema<TState>, initState?: RecursivePartial<TState>) {
        this.form = this.createWizardForm(schema)
        this.stateController = new StateMachineController({ ...schema, ...initState } as TState)
    }

    private applyDefaults(state: TState): TState {
        this.formData.forEach((opt, targetProp) => {
            const current = _.get(state, targetProp)

            if ((current === undefined || nullChildren(current)) && opt.setDefault !== undefined) {
                _.set(state, targetProp, opt.setDefault(state as WizardSchema<TState>))
            }
        })

        return state
    }

    public async run(): Promise<TState | TResult | undefined> {
        this.resolveNextSteps(this.schema as TState, this.applyDefaults(Object.assign({}, this.schema as TState)))
            .forEach(step => this.stateController.addStep(step))
        const outputState = await this.stateController.run()

        return outputState !== undefined ? this.applyDefaults(outputState) : undefined       
    }

    private createBindPrompterMethod<TProp>(prop: string): PrompterBind<TProp, TState> {
        return (
            prompterProvider: (form: StateWithCache<TState>) => Prompter<TProp>, 
            options: ContextOptions<TState, TProp> = {}
        ): void => {
            const stepCache: StepCache = {}
            const boundStep = async (state: TState): Promise<StateMachineStepResult<TState>> => {
                const stateWithCache = Object.assign({ stepCache: stepCache }, state) as StateWithCache<TState>
                this.applyDefaults(stateWithCache)
                const response = await this.promptUser(stateWithCache, prompterProvider(stateWithCache))
                _.set(state, prop, response)

                return { 
                    nextState: state,
                    nextSteps: this.resolveNextSteps(state, _.set(stateWithCache, prop, response)), 
                    controlSignal: isWizardControl(response) ? response.type : undefined,
                }
            }
            
            this.formData.set(prop, { ...options, boundStep })
        }
    }

    private createWizardForm(schema: any, path: string[] = []): WizardForm<TState> { 
        return new Proxy({}, {
            get: (__, prop) => {
                if (prop !== 'bindPrompter') { 
                    return this.createWizardForm(schema, [...path, prop.toString()])
                }
                return this.createBindPrompterMethod(path.join('.'))
            }
        }) as WizardForm<TState>
    }

    // We need to separate the original state from the state with applied defaults. 
    // Otherwise we cannot be certain that the prompt has not occured.
    private resolveNextSteps(originalState: TState, defaultState: TState): StateBranch<TState> {
        const nextSteps: StateBranch<TState> = []
        this.formData.forEach((opt, targetProp) => {
            const current = _.get(originalState, targetProp)

            if ((current === undefined || nullChildren(current)) &&
                !this.stateController.containsStep(opt.boundStep)
            ) {
                if (opt.showWhen === undefined || opt.showWhen(defaultState as WizardSchema<TState>) === true) {
                    nextSteps.push(opt.boundStep)
                }
            }
        })
        return nextSteps
    } 

    private async promptUser<TProp>(
        state: StateWithCache<TState>, 
        prompter: Prompter<TProp>,
    ): Promise<PromptResult<TProp>> {
        prompter.setSteps(this.stateController.currentStep, this.stateController.totalSteps)

        if (state.stepCache.picked !== undefined) {
            prompter.setLastResponse(state.stepCache.picked)
        }

        this.nextPromptEventEmitter.fire(prompter)
        const answer = await prompter.prompt()

        if (!isWizardControl(answer) && answer !== undefined) {
            state.stepCache.picked = prompter.getLastResponse()
        }

        // TODO: allow prompters to resolve into more prompters
        // this allows them to chain together in case of partial-responses

        return answer ?? WIZARD_BACK // Legacy code used 'undefined' to represent back
    }
}