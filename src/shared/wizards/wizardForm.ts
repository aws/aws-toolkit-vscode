/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as toposort from 'toposort'
import { Prompter } from '../ui/prompter'
import { StateWithCache } from './wizard'
import { ExpandWithObject, ReduceTuple } from '../utilities/tsUtils'

/**
 * Defines the shape of a callback that should provide a {@link Prompter} for a certain property type given
 * the current state.
 *
 * Generally this type shouldn't be used in isolation since it relies on types from other classes.
 *
 * The 'state' type is inferred depending on what kind of wizard the prompter is being bound to and will
 * be a partial representation of the 'result' state. That is, the properties of the state at runtime may
 * not be defined and so the resulting type will show all properties as potentially being undefined.
 *
 * The 'prop' type is inferred from the property the prompter is being bounded to. If a wizard has a state with
 * some property called `foo` that has a type of `string`, then the callback must return a `Prompter<string>`
 * if binding to `foo`.
 *
 * These callbacks can declare dependencies on various properties of the state to ensure that they are
 * defined at runtime by using {@link ContextOptions.dependencies} or by manually setting the `TDep` template
 * type to a subtype of an arary of {@link Pathable Pathables}.
 */
export type PrompterProvider<TState, TProp, TDep> = (
    state: StateWithCache<BoundState<TState, TDep>, TProp>
) => Prompter<TProp>

/**
 * Resolves a state with the associated dependency bindings.
 *
 * This uses {@link FindPartialTuple} to recursively set props provided by {@link ExtractPaths}.
 *
 * Example:
 * ```ts
 * // `state` as an object is a runtime construct, so we use the type instead
 * // if you had the actual state, you wouldn't need these types!
 * type State = {
 *    foo?: {
 *       bar: string
 *       qaz: string
 *    }
 *    baz: string
 * }
 * const bindings = [
 *   { path: ['baz'] as const },
 *   { path: ['foo', 'bar'] as const },
 * ]
 *
 * type StateWithBindings = BoundState<State, typeof Bindings>
 * // Equivalent to
 * type StateWithBindings = {
 *    foo: {
 *       bar: string
 *       qaz?: string
 *    }
 *    baz: string
 * }
 * ```
 */
export type BoundState<TState, Bindings> = FindPartialTuple<TState, ExtractPaths<Bindings>>

/**
 * Sets a 'default' value to a property of the state.
 *
 * This is similar to {@link PrompterProvider} but is intended to be more 'ephemeral' and not
 * necessarily a strict binding. A prompter (if shown) would override any defaults set by this function.
 */
type DefaultFunction<TState, TProp, TDep> = (state: BoundState<TState, TDep>) => TProp

/**
 * Changes all properties enumerated by `K` to be required while leaving everything else
 * to be optional. For example, consider `K` as ['foo', 'bar'] for a `T` of:
 * ```ts
 * type State = {
 *    foo?: {
 *       bar: string
 *       qaz: string
 *    }
 *    baz: string
 * }
 * ```
 * Would become:
 * ```ts
 * type PartialState = FindPartialState<State, ['foo', 'bar']>
 * // Equivalent to
 * type PartialState = {
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

/**
 * Applies the 'optional' modifier to all properties recursively.
 */
type RecursivePartial<T> = {
    [P in keyof Required<T>]+?: RecursivePartial<T[P]>
}

/**
 * Primarily a type-helper to infer where a property is located relative to the 'root' element.
 *
 * The `path` field is assumed to be an array of strings that indexes an object. Consider:
 *
 * ```ts
 * type State = {
 *    foo?: {
 *       bar: string
 *       qaz: string
 *    }
 *    baz: string
 * }
 * ```
 *
 * The 'path' of `qaz` should be `[foo, qaz]`
 *
 * If we convert all of `State` into this format:
 *
 * ```ts
 * type StateWithPaths = {
 *    foo: {
 *       path: ['foo']
 *       bar: { path: ['foo', 'bar'] }
 *       qaz: { path: ['foo', 'qaz'] }
 *    }
 *    baz: { path: ['baz'] }
 * }
 * ```
 */
interface Pathable {
    path: string[]
}

/**
 * Extracts the `path` type from a {@link Pathable}
 *
 * We use `infer` here because we want to find a type that is a subset of `string[]` that matches
 * the `path` value of the template type `B`. Example:
 *
 * ```ts
 * const bindings = [
 *   { path: ['baz'] as const },
 *   { path: ['foo', 'bar'] as const },
 * ]
 * type Paths = ExtractPaths<typeof bindings> // readonly ['baz'] | readonly ['foo', 'bar']
 * ```
 *
 * `const` is used in this example to to say that this array will not change so the type can be correctly
 * inferred to its literal type (e.g. ['baz'])
 *
 * Note that we do not reference {@link Pathable} directly to stop circular type dependencies.
 * The binding methods reference this alias and are directly dependent on {@link Pathable} for
 * `TDep`. If we try to infer `K` from `B` we will end up in an infinite loop.
 */
type ExtractPaths<B> = B extends { readonly path: infer K }[] ? (K extends readonly string[] ? K : never) : never

/**
 * Describes how a {@link Prompter} should be bound to the form.
 *
 * The template types are almost equivalent to the ones specified in {@link Prompter} with the extra
 * condition that `TDep` is a subtype of an array of {@link Pathables}. This is not strictly necessary,
 * though if we do not narrow the type then someone passing in a bad dependency array may be confused
 * as to why it's not working and why no errors show up.
 *
 * Keep in mind that other interfaces will infer the `TDep` type from this interface. This is why
 * `TDep` is set to `any[]` by default; we want to make sure that code within this class can still
 * use the interface without needing to know exactly what `TDep` is. If we try to narrow the default
 * type to something like `Pathable[]` we will run into issues of circular type references.
 */
interface ContextOptions<TState, TProp, TDep extends Pathable[] = any[]> {
    /**
     * Applies a conditional function that is evaluated after every user-input but only if the
     * property is either not set or not currently in the state machine. Upon evaluating true,
     * the bound prompter will be added as a new step. If multiple prompters resolve to true
     * in a single resolution step then they will be added in the order in which they were
     * bound.
     *
     * This function is assumed to be 'pure' and will not return something else when called with
     * the same state.
     */
    showWhen?: (state: BoundState<TState, TDep>) => boolean
    /**
     * Sets a default value to the target property. This default is applied to the current state
     * as long as the property has not been set.
     *
     * This function is assumed to be 'pure' and will not return something else when called with
     * the same state.
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

/**
 * A form 'element' is the base object by which wizard forms are composed of. Their main purpose is to
 * route (or 'bind') a {@link PrompterProvider} to a specified property on the form, including whatever
 * context options provided via {@link ContextOptions}
 *
 * `TKey` template type can be inferred by {@link ExtractPaths} if providing an array of {@link FormElement FormElements}
 */
interface FormElement<TProp, TState, TKey extends string[]> {
    /**
     * Binds a {@link PrompterProvider} to the specified property. The provider is called with the current Wizard
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
    /**
     * The path of the property relative to the form root represented as an array of strings.
     */
    readonly path: TKey
}

/**
 * 'parent' elements are any properties on the form that are 'object' types instead of primitives.
 *
 * For these elements we allow some additional methods that only make sense in the context of binding
 * one object to another.
 */
interface ParentFormElement<TProp extends Record<string, any>, TState> {
    /**
     * Applies another form directly onto the property, duplicating whatever prompter bindings the
     * form already had.
     *
     * For example, we may have a form `f1` with props `foo` and `bar` with prompters already bound.
     * Consider another form `f2` with a prop `baz` that has a compatible shape with `f1`. We can layer
     * `f1` onto `baz`, effectively composing the two forms.
     *
     * This can be extended even further by continuing to layer forms onto the same prop `baz` as long
     * as there are no conflicts with previous applications. Any conflicting bindings will throw a
     * runtime error during form construction.
     */
    applyBoundForm<TDep extends Pathable[] = []>(
        form: WizardForm<TProp>,
        options?: Pick<ContextOptions<TState, TProp, TDep>, 'showWhen' | 'dependencies'>
    ): void
}

type PrompterBind<TProp, TState> = FormElement<TProp, TState, any>['bindPrompter']
type SetDefault<TProp, TState> = FormElement<TProp, TState, any>['setDefault']
type ApplyBoundForm<TProp, TState> = ParentFormElement<TProp, TState>['applyBoundForm']

/**
 * The `Form` type is a composition of {@link FormElement} and {@link FormDataElement}, applying types
 * inferred from a base `T` type to 'create' (or rather, alias) the necessary types used by other interfaces.
 *
 * The base case of this alias starts with any type `T`, then traverses the structure looking for any
 * non-primitive types. These types are resolved as `FormElement` + `ParentFormElement` + the recursive
 * alias where:
 *  * `T = T[P]` -> T[P] is just the type of the property
 *  * `TState = TState` -> we want to preserve the alias to the original type
 *  * `TKey = [...TKeys, P]` -> derive a new alias with the property key appended
 *
 * The primitive case is much simpler and just uses whatever aliases are present for the current level
 * of recursion, creating a standard `FormElement`.
 */
type Form<T, TState = T, TKeys extends string[] = []> = {
    [P in keyof T & string]-?: T[P] extends ExpandWithObject<T[P]>
        ? (Form<Required<T[P]>, TState, [...TKeys, P]> & FormElement<T[P], TState, [...TKeys, P]>) &
              ParentFormElement<T[P], TState>
        : FormElement<T[P], TState, [...TKeys, P]>
}

/**
 * A 'resolved' or 'bound' element applied to the form.
 *
 * This may or may not have a {@link PrompterProvider} depending on how it was created.
 */
type FormDataElement<TState, TProp> = ContextOptions<TState, TProp, any> & {
    /**
     * Provides a 'prompt' given the current state.
     *
     * For non-layered forms this is equivalent to whatever was used in `bindPrompter`
     * For layered forms we just 'downlevel' or map the state relative to where the callback expects it to be.
     */
    provider?: PrompterProvider<TState, TProp, any>
    /**
     * Gets the default value (if any) of the property.
     *
     * We can only call the default provider function for a property if the following are true:
     * * `setDefault` exists
     * * The property is undefined in the state
     * * It is not assigned to be shown
     * * It is not dependent on any other properties
     */
    getDefault: (state: TState, assigned: Set<string>) => TProp | undefined
    /**
     * Checks if the property could be shown given the state and currently queued-up properties.
     *
     * If the element has dependencies, we will check to see if the current state has assigned them before
     * calling `showWhen` (if provided).
     *
     * For a 'layered' element, we must always check if the parent element is okay to show before we can
     * resolve the children.
     */
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
    private readonly propertiesCache: Record<string, string[]> = {}
    protected readonly formData = new Map<string, FormDataElement<TState, any>>()
    public readonly body: Form<Required<TState>>

    constructor() {
        this.body = this.createWizardForm()
    }

    /**
     * An array of all properties currently bound to the form.
     *
     * Nested properties are 'flattened' and represented as period-delimited strings, e.g. `foo.bar`.
     * This solves the dependency graph on access. The result is cached until more properties are bound.
     */
    public get properties(): string[] {
        const cacheKey = [...this.formData.keys()].join('|')
        return (this.propertiesCache[cacheKey] ??= this.resolveDependencies())
    }

    /**
     * Returns the associated {@link PrompterProvider} for the property if it exists, undefined otherwise.
     */
    public getPrompterProvider(prop: string): PrompterProvider<TState, any, any> | undefined {
        return this.formData.get(prop)?.provider
    }

    /**
     * Applies 'default' values to a state (see {@link ContextOptions.setDefault setDefault}).
     *
     * @param state The state object to apply defaults to (this will not be mutated).
     * @param assigned A set of 'assigned' properties that are guaranteed to be prompted for.
     *
     * @returns The resolved state.
     */
    public applyDefaults(state: TState, assigned: Set<string>): TState {
        // TODO: optimize and cache results from this function (and `canShow`)
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

    /**
     * Compares the order of two properties based off {@link ContextOptions.relativeOrder}.
     */
    private compareOrder(key1: string, key2: string): number {
        const f1 = this.formData.get(key1)
        const f2 = this.formData.get(key2)

        return (f1?.relativeOrder ?? Number.MAX_VALUE) - (f2?.relativeOrder ?? Number.MAX_VALUE)
    }

    /**
     * Solves the dependency graph for the currently bound properties, respecting {@link ContextOptions.relativeOrder}.
     *
     * @returns An array of property paths represented as period-delimited strings.
     */
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

    /**
     * Assigns a resolved binding to a property key (period-delimited).
     */
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
     * @param defaultState The resolved default state. Uses {@link applyDefaults} if not provided.
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

    /**
     * Resolves {@link ContextOptions} into a format usable by the rest of the form logic.
     *
     * Currently this element is essentially just a closure. If more logic is added it could make sense
     * to turn this into its own class, perhaps combined with {@link convertElement}.
     */
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
