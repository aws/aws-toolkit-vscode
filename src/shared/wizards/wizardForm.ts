/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Prompter } from '../ui/prompter'
import * as _ from 'lodash'
import { StateWithCache, WizardState } from './wizard'
import { ExpandWithObject } from '../utilities/tsUtils'

export type PrompterProvider<TState, TProp> = (state: StateWithCache<WizardState<TState>>) => Prompter<TProp>

type DefaultFunction<TState, TProp> = (state: WizardState<TState>) => TProp | undefined

interface ContextOptions<TState, TProp> {
    /**
     * Applies a conditional function that is evaluated after every user-input but only if the
     * property is either not set or not currently in the state machine. Upon evaluating true,
     * the bound prompter will be added as a new step. If multiple prompters resolve to true
     * in a single resolution step then they will be added in the order in which they were
     * bound.
     */
    showWhen?: (state: WizardState<TState>) => boolean
    /**
     * Sets a default value to the target property. This default is applied to the current state
     * as long as the property has not been set.
     */
    setDefault?: DefaultFunction<TState, TProp>
    /**
     * If true then prompters will only be shown if the parent object exists (default: false)
     */
    requireParent?: boolean
    /**
     * If set to true the wizard will ignore prompts for already assigned properties (default: true)
     */
    implicit?: boolean // not actually implemented
}
interface FormElement<TProp, TState> {
    /**
     * Binds a Prompter-provider to the specified property. The provider is called with the current Wizard
     * state whenever the property is ready for input, and should return a Prompter object.
     */
    bindPrompter(provider: PrompterProvider<TState, TProp>, options?: ContextOptions<TState, TProp>): void
    // TODO: potentially add options to this, or rethink how defaults should work
    setDefault(defaultFunction: DefaultFunction<TState, TProp> | TProp): void
}

// These methods are only applicable to object-like elements
interface ParentFormElement<TProp extends Record<string, any>, TState> {
    applyForm(form: WizardForm<TProp>, options?: ContextOptions<TState, TProp>): void
}

type PrompterBind<TProp, TState> = FormElement<TProp, TState>['bindPrompter']
type SetDefault<TProp, TState> = FormElement<TProp, TState>['setDefault']
type ApplyForm<TProp, TState> = ParentFormElement<TProp, TState>['applyForm']

/** Transforms an interface into a collection of FormElements, applied recursively */
type Form<T, TState = T> = {
    [Property in keyof T]-?: T[Property] extends ExpandWithObject<T[Property]>
        ? (Form<Required<T[Property]>, TState> & FormElement<T[Property], TState>) &
              ParentFormElement<T[Property], TState>
        : FormElement<T[Property], TState>
}

type FormDataElement<TState, TProp> = ContextOptions<TState, TProp> & { provider?: PrompterProvider<TState, TProp> }

function isAssigned<TProp>(obj: TProp): boolean {
    return obj !== undefined || _.isEmpty(obj) === false
}

function checkParent<TState>(prop: string, state: TState, options: FormDataElement<TState, any>): boolean {
    const parent = prop.split('.').slice(0, -1)
    return options.requireParent === true ? parent.length !== 0 && _.get(state, parent) === undefined : false
}

type FormProperty = keyof (FormElement<any, any> & ParentFormElement<any, any>)
const BIND_PROMPTER: FormProperty = 'bindPrompter'
const APPLY_FORM: FormProperty = 'applyForm'
const SET_DEFAULT: FormProperty = 'setDefault'

export class WizardForm<TState extends Partial<Record<keyof TState, unknown>>> {
    protected readonly formData = new Map<string, FormDataElement<TState, any> & { _isForm?: boolean }>()
    public readonly body: Form<Required<TState>>

    constructor() {
        this.body = this.createWizardForm()
    }

    public get properties(): string[] {
        return [...this.formData.keys()]
    }

    public getPrompterProvider(prop: string): PrompterProvider<TState, any> | undefined {
        return this.formData.get(prop)?.provider
    }

    public isImplicit(prop: string): boolean {
        return this.formData.get(prop)?.implicit ?? true
    }

    public applyDefaults(state: TState): TState {
        const defaultState = _.cloneDeep(state)

        this.formData.forEach((opt, targetProp) => {
            const current = _.get(state, targetProp)

            if (!isAssigned(current) && opt.setDefault !== undefined && !checkParent(targetProp, state, opt)) {
                const defaultValue = opt.setDefault(state as WizardState<TState>)
                if (defaultValue !== undefined) {
                    _.set(defaultState, targetProp, defaultValue)
                }
            }
        })

        return defaultState
    }

    private applyElement(key: string, element: FormDataElement<TState, any> & { _isForm?: boolean }) {
        this.formData.set(key, { ...this.formData.get(key), ...element })
    }

    public canShowProperty(prop: string, state: TState, defaultState: TState = this.applyDefaults(state)): boolean {
        const current = _.get(state, prop)
        const options = this.formData.get(prop) ?? {}

        if (isAssigned(current) || checkParent(prop, state, options)) {
            return false
        }

        if (options.showWhen !== undefined && !options.showWhen(defaultState as WizardState<TState>)) {
            return false
        }

        return options.provider !== undefined || (options._isForm ?? false)
    }

    private convertElement<TProp>(
        prop: string,
        element: FormDataElement<TProp, any>,
        options?: ContextOptions<TState, TProp>
    ): FormDataElement<TState, any> {
        const wrappedElement: FormDataElement<TState, any> = {}

        if (element.provider !== undefined) {
            wrappedElement.provider = state => {
                const stateWithCache = Object.assign(_.get(state, prop, {}), { stepCache: state.stepCache })

                return element.provider!(stateWithCache as StateWithCache<WizardState<TProp>>)
            }
        }

        if (element.showWhen !== undefined || options?.showWhen !== undefined || options?.requireParent === true) {
            wrappedElement.showWhen = state =>
                (options?.requireParent !== true || _.get(state, prop) !== undefined) &&
                (element.showWhen !== undefined ? element.showWhen!(_.get(state, prop, {})) : true) &&
                (options?.showWhen !== undefined ? options.showWhen!(state) : true)
        }

        wrappedElement.setDefault =
            element.setDefault !== undefined
                ? state =>
                      options?.requireParent !== true || _.get(state, prop) !== undefined
                          ? element.setDefault!(_.get(state, prop, {}))
                          : undefined
                : undefined

        wrappedElement.implicit = element.implicit ?? options?.implicit
        wrappedElement.requireParent = element.requireParent ?? options?.requireParent

        return wrappedElement
    }

    private createBindPrompterMethod<TProp>(prop: string): PrompterBind<TProp, TState> {
        return (provider: PrompterProvider<TState, TProp>, options: ContextOptions<TState, TProp> = {}): void => {
            this.applyElement(prop, { ...options, provider })
        }
    }

    private createApplyFormMethod<TProp>(prop: string): ApplyForm<TProp, TState> {
        return (form: WizardForm<TProp>, options?: ContextOptions<TState, TProp>) => {
            form.formData.forEach((element, key) => {
                this.applyElement(`${prop}.${key}`, this.convertElement(prop, element, options))
            })

            this.applyElement(prop, { _isForm: true, ...options })
        }
    }

    private createSetDefaultMethod<TProp>(prop: string): SetDefault<TProp, TState> {
        return (defaultFunction: DefaultFunction<TState, TProp> | TProp) =>
            typeof defaultFunction !== 'function' // TODO: fix these types, TProp can technically be a function...
                ? this.applyElement(prop, { setDefault: () => defaultFunction })
                : this.applyElement(prop, { setDefault: defaultFunction as DefaultFunction<TState, TProp> })
    }

    // Generates a virtualized object with the same shape as the Form interface
    private createWizardForm(path: string[] = []): Form<Required<TState>> {
        return new Proxy(
            {},
            {
                get: (__, prop) => {
                    switch (prop) {
                        case BIND_PROMPTER:
                            return this.createBindPrompterMethod(path.join('.'))
                        case APPLY_FORM:
                            return this.createApplyFormMethod(path.join('.'))
                        case SET_DEFAULT:
                            return this.createSetDefaultMethod(path.join('.'))
                        default:
                            return this.createWizardForm([...path, prop.toString()])
                    }
                },
            }
        ) as Form<Required<TState>>
    }
}
