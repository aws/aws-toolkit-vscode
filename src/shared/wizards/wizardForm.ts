/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as toposort from 'toposort'
import { Prompter } from '../ui/prompter'
import { StateWithCache } from './wizard'
import { ExpandWithObject, ReduceTuple } from '../utilities/tsUtils'

export type PrompterProvider<TState, TProp, TDep> = (
    state: StateWithCache<BoundState<TState, TDep>, TProp>
) => Prompter<TProp>
export type BoundState<TState, Bindings> = FindPartialTuple<TState, ExtractPaths<Bindings>>

type DefaultFunction<TState, TProp, TDep> = (state: BoundState<TState, TDep>) => TProp | undefined

/**
 * Changes all properties enumerated by `K` to be required while leaving everything else
 * to be optional. For example, consider `K` as ['foo', 'bar'] for a `T` of:
 * ```
 * {
 *    foo?: {
 *       bar: string
 *       qaz: string
 *    }
 *    baz: string
 * }
 * ```
 * Would become:
 * ```
 * {
 *    foo: {
 *       bar: string
 *       qaz?: string
 *    }
 *    baz?: string
 * }
 * ```
 * `M` is used to describe when there is a matched key. Matched keys should return their type,
 * while non-matches are considered to be unassigned, and thus are potentially undefined.
 */
type FindPartialTuple<T, K extends string[], M extends boolean = false> = K['length'] extends 0
    ? M extends true
        ? T
        : RecursivePartial<T>
    : {
          [P in keyof T as P & K[0]]-?: FindPartialTuple<T[P], ReduceTuple<K>, true>
      } &
          {
              [P in keyof T as Exclude<P, K[0]>]+?: FindPartialTuple<T[P], ReduceTuple<K>, false>
          }

type RecursivePartial<T> = {
    [P in keyof Required<T>]+?: RecursivePartial<T[P]>
}

// This is basically just a 'type-helper' to retain information about where to find a property
// relative to a 'root' element
interface Pathable {
    path: string[]
}

// Extracts the 'paths' of a type relative to the root type
type ExtractPaths<B> = B extends { path: infer K }[] ? (K extends string[] ? K : never) : never

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
    showWhen?: (state: BoundState<TState, TDep>) => boolean
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
     * won't be invoked until all dependencies have a defined value. Keep in mind that a property
     * can still be queued up to be shown given all of its dependencies have been _assigned_
     * (but not yet shown) since it's guaranteed that its depedencies will be resolved by the time
     * it's shown.
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
    /**
     * This is similar to {@link ContextOptions.setDefault setDefault} but without needing to bind a
     * prompter along with the default value. You can also use a 'state-independent' value instead of
     * a function (e.g. string, number, etc.)
     */
    setDefault<TDep extends Pathable[] = []>(
        defaultFunction: DefaultFunction<TState, TProp, TDep> | TProp,
        options?: Pick<ContextOptions<TState, TProp, TDep>, 'dependencies'>
    ): void
    /** The path of the property relative to the form root */
    readonly path: TKey
}

// These methods are only applicable to object-like elements
interface ParentFormElement<TProp extends Record<string, any>, TState> {
    applyBoundForm<TDep extends Pathable[] = []>(
        form: WizardForm<TProp>,
        options?: Pick<ContextOptions<TState, TProp, TDep>, 'showWhen' | 'dependencies'>
    ): void
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
    /** Provides a 'prompt' given the current state */
    provider?: PrompterProvider<TState, TProp, any>
    /** Gets the default value (if any) of the property */
    getDefault: (state: TState, assigned: Set<string>) => TProp | undefined
    /**  Checks if the property could be shown given the state and currently queued-up properties */
    canShow: (state: TState, assigned: Set<string>) => boolean
}

function isSet<TProp>(obj: TProp): boolean {
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

    /** Applies 'default' values to a state (see {@link ContextOptions.setDefault setDefault}) */
    public applyDefaults(state: TState, assigned: Set<string>): TState {
        // TODO: optimize and cache results from this function
        // All 'default' functions are assumed to be pure, so given a certain state we can safely cache the result
        const defaultState = _.cloneDeep(state)

        this.formData.forEach((opt, targetProp) => {
            const value = opt.getDefault(state, assigned)
            if (value !== undefined) {
                _.set(defaultState, targetProp, value)
            }
        })

        return defaultState
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

    private setElement(key: string, element: FormDataElement<TState, any>) {
        const oldElement = this.formData.get(key)
        if (oldElement?.provider !== undefined && element?.provider !== undefined) {
            throw new Error(`Cannot re-bind property: ${key}`)
        }
        if (oldElement?.setDefault !== undefined && element?.setDefault !== undefined) {
            throw new Error(`Cannot set another default for property: ${key}`)
        }
        this.formData.set(key, element)
    }

    /**
     * Checks if the property can be queued up to be shown in a wizard flow
     *
     * @param prop Property to check
     * @param state Current state of the wizard
     * @param assigned Properties that are queued up to be shown
     *
     * @returns True if the property can be shown (or queued up to be shown)
     */
    public canShowProperty(
        prop: string,
        state: TState,
        assigned: Set<string> = new Set(),
        defaultState: TState = this.applyDefaults(state, assigned)
    ): boolean {
        const current = _.get(state, prop)
        const options = this.formData.get(prop)

        if (options === undefined || assigned.has(prop) || isSet(current)) {
            return false
        }

        const assignedDefault = new Set(
            [...this.formData.keys()].filter(key => isSet(_.get(defaultState, key))).concat([...assigned])
        )

        return options.canShow(defaultState, assignedDefault) && options.provider !== undefined
    }

    private createElement<TProp>(
        prop: string,
        options: ContextOptions<TState, TProp> = {}
    ): FormDataElement<TState, any> {
        const element = Object.assign({}, options) as FormDataElement<TState, any>

        const isDependent = (state: TState, assigned = new Set<string>()) => {
            const dependencies = ((options.dependencies as Pathable[]) ?? []).filter(({ path }) => path.length > 0)

            return dependencies.some(
                ({ path }) => !assigned.has(path.join('.')) && !isSet(_.get(state, path.join('.')))
            )
        }

        element.canShow = (state, assigned) => {
            if (options.showWhen !== undefined) {
                return !isDependent(state) && options.showWhen(state)
            } else {
                return !isDependent(state, assigned)
            }
        }

        element.getDefault = (state, assigned) => {
            const current = _.get(state, prop)

            if (options.setDefault !== undefined && !isSet(current) && !assigned.has(prop) && !isDependent(state)) {
                return options.setDefault(state)
            }
        }

        return element
    }

    /**
     * 'Converts' an element by lifting it into a different wizard.
     *
     * This creates a new 'layer' element with `options`, then applies a mapping to passed-in values as to
     * preserve what the element originally expects. For example, consider an element bound to 'foo.bar'
     * and a new wizard that accepts a 'foo' type at property 'baz'. The lifted element would convert to
     * 'baz.foo.bar', but the bound methods are still scoped to 'foo', thus we map the paths.
     */
    private convertElement<TProp>(
        prop: string,
        element: FormDataElement<TProp, any>,
        options: ContextOptions<TState, TProp> = {}
    ): FormDataElement<TState, any> {
        const wrappedElement = {} as FormDataElement<TState, any>

        if (element.provider !== undefined) {
            wrappedElement.provider = state => {
                const stateWithCache = Object.assign(_.get(state, prop, {}), {
                    stepCache: state.stepCache,
                    estimator: state.estimator,
                })

                return element.provider!(stateWithCache)
            }
        }

        const mapAssigned = (assigned: Set<string>) => {
            return new Set([...assigned.keys()].map(k => k.replace(`${prop}.`, '')))
        }

        const mapState = (state: TState) => {
            return _.get(state, prop, {})
        }

        const layer = this.createElement(prop, options)

        wrappedElement.canShow = (state, assigned) => {
            return layer.canShow(state, assigned) && element.canShow(mapState(state), mapAssigned(assigned))
        }

        wrappedElement.getDefault = (state, assigned) => {
            return (
                layer.getDefault(state, assigned) ??
                (layer.canShow(state, new Set())
                    ? element.getDefault(mapState(state), mapAssigned(assigned))
                    : undefined)
            )
        }

        wrappedElement.relativeOrder = options.relativeOrder ?? element.relativeOrder
        wrappedElement.dependencies = (options.dependencies ?? []).concat(
            (element.dependencies ?? []).map(({ path }: { path: string[] }) => {
                return { path: prop.split('.').concat(path) }
            })
        )

        return wrappedElement
    }

    private createBindPrompterMethod<TProp>(prop: string): PrompterBind<TProp, TState> {
        return (
            provider: PrompterProvider<TState, TProp, any>,
            options: ContextOptions<TState, TProp, any> = {}
        ): void => {
            this.setElement(prop, Object.assign(this.createElement(prop, options), { provider }))
        }
    }

    private createApplyFormMethod<TProp>(prop: string): ApplyBoundForm<TProp, TState> {
        return (form: WizardForm<TProp>, options?: ContextOptions<TState, TProp, any>) => {
            form.formData.forEach((element, key) => {
                this.setElement(`${prop}.${key}`, this.convertElement(prop, element, options))
            })
        }
    }

    private createSetDefaultMethod<TProp>(prop: string): SetDefault<TProp, TState> {
        return (
            defaultValue: DefaultFunction<TState, TProp, any> | TProp,
            options: ContextOptions<TState, TProp, any> = {}
        ) => {
            const defaultFunc = typeof defaultValue !== 'function' ? () => defaultValue : defaultValue
            options.setDefault = defaultFunc as DefaultFunction<TState, TProp, any>
            this.setElement(prop, this.createElement(prop, options))
        }
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
