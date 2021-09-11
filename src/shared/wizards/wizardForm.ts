/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as toposort from 'toposort'
import { Prompter } from '../ui/prompter'
import { StateWithCache, WizardState } from './wizard'
import { ExpandWithObject } from '../utilities/tsUtils'

export type PrompterProvider<TState, TProp, TDep> = (
    state: StateWithCache<BoundState<WizardState<TState>, TDep>, TProp>
) => Prompter<TProp>

type DefaultFunction<TState, TProp, TDep> = (state: BoundState<WizardState<TState>, TDep>) => TProp | undefined
type BoundState<TState, Bindings> = Bindings extends [] ? TState : FindPartialTuple<TState, CombineBindings<Bindings>>

type ReduceTuple<T> = T extends [any, ...infer P] ? P : T
// TODO: rework this into wizard state
type FindPartialTuple<T, K extends string[]> = K['length'] extends 0
    ? never
    : {
          [P in keyof T as P & K[0]]-?: T[P]
      } &
          {
              [P in keyof T]: P extends K[0]
                  ? T[P] extends Record<string, unknown>
                      ? FindPartialTuple<T[P], ReduceTuple<K>>
                      : T[P]
                  : T[P]
          }

interface Pathable {
    path: string[]
}

type CombineBindings<B> = B extends { path: infer K }[] ? (K extends string[] ? K : never) : never

// *************************************************************************************//
// TODO: add a 'ContextBuilder' object that just pipes these options to the destination //
// *************************************************************************************//
interface ContextOptions<TState, TProp, TDep extends Pathable[] = []> {
    /**
     * Applies a conditional function that is evaluated after every user-input but only if the
     * property is either not set or not currently in the state machine. Upon evaluating true,
     * the bound prompter will be added as a new step. If multiple prompters resolve to true
     * in a single resolution step then they will be added in the order in which they were
     * bound.
     */
    showWhen?: (state: BoundState<WizardState<TState>, TDep>) => boolean
    /**
     * Sets a default value to the target property. This default is applied to the current state
     * as long as the property has not been set.
     */
    setDefault?: DefaultFunction<TState, TProp, TDep>
    /**
     * Used to determine which prompter should be shown when multiple prompters are able to be
     * show in a single instance. A lower order will be shown before a higher order.
     */
    relativeOrder?: number
    /**
     * Establishes property dependencies. Declaring dependencies means any state-dependent callback
     * won't be invoked until all dependencies have a defined value.
     */
    dependencies?: TDep
}
interface FormElement<TProp, TState, TKey extends string[]> {
    /**
     * Binds a Prompter-provider to the specified property. The provider is called with the current Wizard
     * state whenever the property is ready for input, and should return a Prompter object.
     */
    bindPrompter<TDep extends Pathable[] = []>(
        provider: PrompterProvider<TState, TProp, TDep>,
        options?: ContextOptions<TState, TProp, TDep>
    ): void
    // TODO: potentially add options to this, or rethink how defaults should work
    setDefault<TDep extends Pathable[] = []>(
        defaultFunction: DefaultFunction<TState, TProp, TDep> | TProp,
        options?: Pick<ContextOptions<TState, TProp, TDep>, 'dependencies'>
    ): void
    /** The path of the property relative to the form root */
    readonly path: TKey
}

// These methods are only applicable to object-like elements
interface ParentFormElement<TProp extends Record<string, any>, TState> {
    applyBoundForm(form: WizardForm<TProp>, options?: Pick<ContextOptions<TState, TProp>, 'showWhen'>): void
}

type PrompterBind<TProp, TState> = FormElement<TProp, TState, any>['bindPrompter']
type SetDefault<TProp, TState> = FormElement<TProp, TState, any>['setDefault']
type ApplyBoundForm<TProp, TState> = ParentFormElement<TProp, TState>['applyBoundForm']

/** Transforms an interface into a collection of FormElements, applied recursively */
type Form<T, TState = T, TKeys extends string[] = []> = {
    [P in keyof T & string]-?: T[P] extends ExpandWithObject<T[P]>
        ? (Form<Required<T[P]>, TState, [...TKeys, P]> & FormElement<T[P], TState, [...TKeys, P]>) &
              ParentFormElement<T[P], TState>
        : FormElement<T[P], TState, [...TKeys, P]>
}

type FormDataElement<TState, TProp> = ContextOptions<TState, TProp, any> & {
    provider?: PrompterProvider<TState, TProp, any>
}

function isAssigned<TProp>(obj: TProp): boolean {
    return obj !== undefined || _.isEmpty(obj) === false
}

type FormProperty = keyof (FormElement<any, any, any> & ParentFormElement<any, any>)
const BIND_PROMPTER: FormProperty = 'bindPrompter'
const APPLY_FORM: FormProperty = 'applyBoundForm'
const SET_DEFAULT: FormProperty = 'setDefault'
const PATH: FormProperty = 'path'

/**
 * Maps individual {@link Prompter prompters} to a desired property of the output interface as defined by
 * the generic type. Properties can the be queried for their bound prompters by consuming classes.
 */
export class WizardForm<TState extends Partial<Record<keyof TState, unknown>>> {
    protected readonly formData = new Map<string, FormDataElement<TState, any>>()
    public readonly body: Form<Required<TState>>

    constructor() {
        this.body = this.createWizardForm()
    }

    // note: this solves the dependency tree, so even though it's an accessor it's a pretty expensive one
    public get properties(): string[] {
        return this.resolveDependencies()
    }

    public getPrompterProvider(prop: string): PrompterProvider<TState, any, any> | undefined {
        return this.formData.get(prop)?.provider
    }

    public applyDefaults(state: TState, assigned?: Set<string>): TState {
        const defaultState = _.cloneDeep(state)

        this.formData.forEach((opt, targetProp) => {
            const current = _.get(state, targetProp)

            if (!isAssigned(current) && opt.setDefault !== undefined && !this.isDependent(targetProp, defaultState)) {
                const defaultValue = opt.setDefault(state as WizardState<TState>)
                if (defaultValue !== undefined) {
                    _.set(defaultState, targetProp, defaultValue)
                }
            }
        })

        return defaultState
    }

    /**
     * Returns true when the element has unresolved dependencies
     * 'assigned' are properties that are currently undefined within the state but are guaranteed to be assigned
     * prior to the current element
     */
    private isDependent<TState>(prop: string, state: TState, assigned: Set<string> = new Set()) {
        const element = this.formData.get(prop) ?? {}
        const dependencies = ((element.dependencies as Pathable[]) ?? [])
            //    .concat({ path: prop.split('.').slice(0, -1) }) // requires props to have defined parents
            .filter(({ path }) => path.length > 0)

        if (
            dependencies.some(
                ({ path }: { path: string[] }) =>
                    !assigned.has(path.join('.')) && !isAssigned(_.get(state, path.join('.')))
            )
        ) {
            return true
        }

        return false
    }

    private compareOrder(key1: string, key2: string): number {
        const f1 = this.formData.get(key1)
        const f2 = this.formData.get(key2)

        return (f1?.relativeOrder ?? Number.MAX_VALUE) - (f2?.relativeOrder ?? Number.MAX_VALUE)
    }

    private resolveDependencies(): string[] {
        const keys = [...this.formData.keys()].sort(this.compareOrder.bind(this))
        const edges = <[string, string][]>(
            _.flatMap(keys, key =>
                (this.formData.get(key)!.dependencies ?? []).map(({ path }: { path: string[] }) => [
                    key,
                    path.join('.'),
                ])
            )
        )
        const nodes = new Set(keys)
        edges.forEach(([v1, v2]) => (nodes.add(v1), nodes.add(v2)))
        return toposort.array([...nodes.keys()].reverse(), edges).reverse()
    }

    private applyElement(key: string, element: FormDataElement<TState, any>) {
        this.formData.set(key, { ...this.formData.get(key), ...element })
    }

    public canShowProperty(
        prop: string,
        state: TState,
        assigned: Set<string> = new Set(),
        defaultState: TState = this.applyDefaults(state, assigned)
    ): boolean {
        const current = _.get(state, prop)
        const options = this.formData.get(prop) ?? {}

        // TODO: use assigned set there instead
        if (isAssigned(current)) {
            return false
        }

        const assignedDefault = new Set(
            [...assigned.keys(), ...this.formData.keys()].filter(key => isAssigned(_.get(defaultState, key)))
        )

        if (this.isDependent(prop, state, assignedDefault)) {
            return false
        }

        if (options.showWhen !== undefined && !options.showWhen(defaultState as WizardState<TState>)) {
            return false
        }

        return options.provider !== undefined
    }

    private convertElement<TProp>(
        prop: string,
        element: FormDataElement<TProp, any>,
        options: ContextOptions<TState, TProp> = {}
    ): FormDataElement<TState, any> {
        const wrappedElement: FormDataElement<TState, any> = {}

        if (element.provider !== undefined) {
            wrappedElement.provider = state => {
                const stateWithCache = Object.assign(_.get(state, prop, {}), {
                    stepCache: state.stepCache,
                    estimator: state.estimator,
                })

                return element.provider!(stateWithCache)
            }
        }

        if (element.showWhen !== undefined || options.showWhen !== undefined) {
            wrappedElement.showWhen = state =>
                (element.showWhen !== undefined ? element.showWhen!(_.get(state, prop, {})) : true) &&
                (options.showWhen !== undefined ? options.showWhen!(state) : true)
        }

        if (element.dependencies !== undefined) {
            wrappedElement.dependencies = element.dependencies.map(({ path }: { path: string[] }) => {
                return { path: prop.split('.').concat(path) }
            })
        }

        wrappedElement.setDefault =
            element.setDefault !== undefined
                ? state =>
                      options.showWhen === undefined || options.showWhen(state)
                          ? element.setDefault!(_.get(state, prop, {}))
                          : undefined
                : undefined

        return wrappedElement
    }

    private createBindPrompterMethod<TProp>(prop: string): PrompterBind<TProp, TState> {
        return <TDep extends Pathable[] = []>(
            provider: PrompterProvider<TState, TProp, TDep>,
            options: ContextOptions<TState, TProp, TDep> = {}
        ): void => {
            this.applyElement(prop, <ContextOptions<TState, TProp>>{ ...options, provider })
        }
    }

    private createApplyFormMethod<TProp>(prop: string): ApplyBoundForm<TProp, TState> {
        return (form: WizardForm<TProp>, options?: ContextOptions<TState, TProp>) => {
            form.formData.forEach((element, key) => {
                // TODO: use an assert here to ensure that no elements are rewritten
                this.applyElement(`${prop}.${key}`, this.convertElement(prop, element, options))
            })
        }
    }

    private createSetDefaultMethod<TProp>(prop: string): SetDefault<TProp, TState> {
        return (
            defaultFunction: DefaultFunction<TState, TProp, any> | TProp,
            options?: ContextOptions<TState, TProp, any>
        ) =>
            typeof defaultFunction !== 'function' // TODO: fix these types, TProp can technically be a function...
                ? this.applyElement(prop, { setDefault: () => defaultFunction, ...options })
                : this.applyElement(prop, {
                      setDefault: defaultFunction as DefaultFunction<TState, TProp, any>,
                      ...options,
                  })
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
                        case PATH:
                            return path
                        default:
                            return this.createWizardForm([...path, prop.toString()])
                    }
                },
            }
        ) as Form<Required<TState>>
    }
}
