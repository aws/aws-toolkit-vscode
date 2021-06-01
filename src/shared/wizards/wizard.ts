/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { StateBranch, StateMachineController, StateStepFunction } from './stateController'
import * as vscode from 'vscode'
import { Prompter } from '../../shared/ui/prompter'

type QuickInputTypes<T> = string | T | T[] | symbol | undefined

interface PropertyOptions<TState, TProp> {
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
     * Automatically assigns the property if only a single option is available. This happens before
     * the step is added to the wizard, decreasing the total number of steps.
     */
    //autoSelect?: boolean (not implemented)
}

export type WizardQuickPickItem<T> =  T extends string 
    ? vscode.QuickPickItem & { metadata?: string | symbol | (() => Promise<string | symbol>) }
    : vscode.QuickPickItem & { metadata: T | symbol | (() => Promise<T | symbol>) }

/** Returning this causes the wizard to retry the current step */
export const WIZARD_RETRY = Symbol()

function isRetry<T>(picked: QuickInputTypes<T> | undefined): boolean {
    return picked !== undefined && picked === WIZARD_RETRY
}

function nullChildren(obj: any): boolean {
    return typeof obj === 'object' && Object.keys(obj).every(key => obj[key] === undefined)
}

type PrompterBind<TProp, TState> = (getPrompter: (state: WizardSchema<TState> & { stepCache: StepCache }) => 
    Prompter<TProp>, options?: PropertyOptions<TState, TProp>) => void
interface WizardFormElement<TProp, TState> {
    /**
     * TODO: change this so Prompters are not regenerated upon every call (i.e. add update functionality to prompter)
     * Binds a Prompter provider to the specified property. The provider is called whenever the property is ready for 
     * input, and should return a Prompter object.
     */
    readonly bindPrompter: PrompterBind<TProp, TState>
}

/**
 * Transforms an interface into a collection of WizardFormElements
 */
type WizardForm<T> = {
    [Property in keyof T]-?: T[Property] extends Record<string, unknown> 
        ? WizardForm<T[Property]> & WizardFormElement<T[Property], T>
        : WizardFormElement<T[Property], T>
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

function writePath(obj: any, path: string[], value: any): void {
    if (value === undefined) {
        return
    }
    if (path.length === 1) {
        return obj[path[0]] = value
    } else if (path.length > 1) {
        const key = path.shift()!
        obj[key] = obj[key] ?? {}
        return writePath(obj[key], path, value)
    }
}

function readPath(obj: any, path: string[]): any {
    if (obj === undefined) {
        return undefined
    }
    if (path.length === 1) {
        return obj[path[0]]
    } else if (path.length > 1) {
        return readPath(obj[path.shift()!], path)
    }
}

// Persistent storage that exists on a per-property basis
type StepCache = { [key: string]: any }

/**
 * A generic wizard that consumes data from a series of 'prompts'. Wizards will modify a single property of
 * their internal state with each prompt. Classes that extend this base class can assign Prompters to individual
 * properties by using the internal 'form' object. 
 */
export abstract class Wizard<TState extends WizardSchema<TState>, TResult=TState> {
    private readonly formData = new Map<string, PropertyOptions<TState, any> & { boundStep?: StateStepFunction<TState> }>()
    private currentPromper?: Prompter<any>
    protected readonly form!: WizardForm<TState> 
    private readonly stateController!: StateMachineController<TState>

    public constructor(private readonly schema: WizardSchema<TState>, initState?: TState) {
        this.form = this.createWizardForm(schema)
        this.stateController = new StateMachineController({ ...schema, ...initState} as TState)
    }

    private applyDefaults(state: TState): TState {
        this.formData.forEach((options, targetProp) => {
            const current = readPath(state, targetProp.split('.'))

            if ((current === undefined || nullChildren(current))) {
                if (options.setDefault !== undefined) {
                    writePath(state, targetProp.split('.'), options.setDefault(state))
                }
            }
        })

        return state
    }

    public async run(): Promise<TState | TResult | undefined> {
        this.resolveNextSteps(this.schema as any).forEach(step => this.stateController.addStep(step))
        const outputState = await this.stateController.run()
        return outputState ? this.applyDefaults(outputState) : undefined
    }

    public getCurrentPrompter(): Prompter<any> | undefined {
        return this.currentPromper
    }

    private createBindPrompterMethod<TProp>(propPath: string[]): PrompterBind<TProp, TState> {
        return (
            prompterProvider: (form: TState & { stepCache: StepCache }) => Prompter<TProp>, 
            options: PropertyOptions<TState, TProp> = {}
        ) => {
            if (this.formData.get(propPath.join('.')) !== undefined) {
                throw new Error('Can only bind one prompt per property')
            }

            const stepCache: StepCache = {}
            const boundStep = async (state: TState) => {
                const stateWithCache = Object.assign(state, { stepCache: stepCache })
                const response = await this.promptUser(stateWithCache, prompterProvider(stateWithCache))
                writePath(state, propPath, response)
                const steps = this.resolveNextSteps(state)
                return { 
                    nextState: response !== undefined ? state : undefined,
                    nextSteps: steps, 
                    repeatStep: isRetry(response) 
                }
            }
    
            this.formData.set(propPath.join('.'), { ...options, boundStep })
        }
    }

    private createWizardForm(schema: any, path: string[] = []): WizardForm<TState> {
        const form = {}
        
        Object.entries(schema).forEach(([key, value]: [string, unknown]) => {
            const newPath = [...path, key]
            const element = {
                bindPrompter: this.createBindPrompterMethod(newPath),
                ...(typeof value === 'object' ?  this.createWizardForm(value, newPath) : {})
            } as WizardFormElement<any, any>

            Object.assign(form, { [key]: element })
        })

        return form as WizardForm<TState>
    }

    private resolveNextSteps(state: TState): StateBranch<TState> {
        const nextSteps: StateBranch<TState> = []
        this.formData.forEach((options, targetProp) => {
            const current = readPath(state, targetProp.split('.'))

            if ((current === undefined || nullChildren(current)) &&
                !this.stateController.containsStep(options.boundStep)
            ) {
                if (options.showWhen === undefined || options.showWhen(state) === true) {
                    nextSteps.push(options.boundStep!)
                }
            }
        })
        return nextSteps
    } 

    private async promptUser<TProp>(
        state: TState & { stepCache: StepCache }, 
        prompter: Prompter<TProp>,
    ): Promise<QuickInputTypes<TProp>> {
        this.currentPromper = prompter
        prompter.setSteps(this.stateController.currentStep, this.stateController.totalSteps)

        if (state.stepCache.picked !== undefined) {
            prompter.setLastPicked(state.stepCache.picked)
        }

        const answer = await prompter.prompt()

        if (answer !== undefined) {
            state.stepCache.picked = prompter.getLastPicked()
        }

        this.currentPromper = undefined

        return answer
    }
}