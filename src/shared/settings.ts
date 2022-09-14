/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as packageJson from '../../package.json'
import { getLogger } from './logger'
import { cast, FromDescriptor, TypeConstructor, TypeDescriptor } from './utilities/typeConstructors'
import { ClassToInterfaceType, keys } from './utilities/tsUtils'
import { toRecord } from './utilities/collectionUtils'
import { isNameMangled } from './vscode/env'
import { once } from './utilities/functionUtils'
import { UnknownError } from './errors'

type Workspace = Pick<typeof vscode.workspace, 'getConfiguration' | 'onDidChangeConfiguration'>

/**
 * A class for manipulating VS Code user settings (from all extensions).
 *
 * This is distinct from {@link TypedSettings} which is backed by validation functions.
 * Use this class when very simple reading/writing to settings is needed.
 *
 * When additional logic is needed, prefer {@link fromExtensionManifest} for better encapsulation.
 */
export class Settings {
    public constructor(
        private readonly target = vscode.ConfigurationTarget.Global,
        private readonly scope: vscode.ConfigurationScope | undefined = undefined,
        private readonly workspace: Workspace = vscode.workspace
    ) {}

    /**
     * Reads a setting, applying the {@link TypeConstructor} if provided.
     *
     * Note that the absence of a key is indistinguisable from the absence of a value.
     * That is, `undefined` looks the same across all calls. Any non-existent values are
     * simply returned as-is without passing through the type cast.
     */
    public get(key: string): unknown
    public get<T>(key: string, type: TypeConstructor<T>): T | undefined
    public get<T>(key: string, type: TypeConstructor<T>, defaultValue: T): T
    public get<T>(key: string, type?: TypeConstructor<T>, defaultValue?: T) {
        const value = this.getConfig().get(key, defaultValue)

        return !type || value === undefined ? value : cast(value, type)
    }

    /**
     * Attempts to write to the settings.
     *
     * Settings can only be written to so long as a extension contributes the specified key
     * in their `package.json`. If no contribution exists, then the write will fail, causing
     * this method to return false.
     *
     * Writing to settings may fail if the user does not have write permissions, or if some
     * requirement is not met. For example, the `vscode.ConfigurationTarget.Workspace` target
     * requires a workspace.
     */
    public async update(key: string, value: unknown): Promise<boolean> {
        try {
            await this.getConfig().update(key, value, this.target)

            return true
        } catch (error) {
            getLogger().warn(`Settings: failed to update "${key}": ${error}`)

            return false
        }
    }

    /**
     * Returns a scoped "slice" (or "view") of the settings configuration.
     *
     * The returned {@link Settings} interface is limited to the provided section.
     *
     * Example:
     * ```ts
     * const section = settings.getSection('aws.samcli')
     * const samCliLocation = section.get('location')
     *
     * // Reset all settings under `aws.samcli`
     * await section.reset()
     * ```
     */
    public getSection(section: string): ResetableMemento {
        const parts = section.split('.')
        const targetKey = parts.pop() ?? section
        const parentSection = parts.join('.')

        return {
            get: (key, defaultValue?) => this.getConfig(section).get(key, defaultValue),
            reset: async () => this.getConfig().update(section, undefined, this.target),
            update: async (key, value) => {
                // VS Code's settings API can read nested props but not write to them.
                // We need to write to the parent if we cannot write to the child.
                //
                // TODO(sijaden): potentially provide valid keys upfront to avoid needing to
                // handle this asymmetry with try/catch

                try {
                    return await this.getConfig(section).update(key, value, this.target)
                } catch (error) {
                    const parent = this.getConfig(parentSection)
                    const val = parent.get(targetKey)

                    if (typeof val === 'object') {
                        return parent.update(targetKey, { ...val, [key]: value }, this.target)
                    }

                    throw error
                }
            },
        }
    }

    /**
     * Registers an event listener for a particular section of the settings.
     */
    public onDidChangeSection(
        section: string,
        listener: (event: vscode.ConfigurationChangeEvent) => unknown
    ): vscode.Disposable {
        const toRelative = (sub: string) => (section ? [section, sub] : [sub]).join('.')

        return this.workspace.onDidChangeConfiguration(e => {
            const affectsConfiguration = (section: string) => e.affectsConfiguration(toRelative(section), this.scope)

            if (!section || e.affectsConfiguration(section, this.scope)) {
                listener({ affectsConfiguration })
            }
        })
    }

    /**
     * Gets the workspace configuration, optionally scoped to a section.
     *
     * The resulting configuration object should not be cached.
     */
    private getConfig(section?: string) {
        return this.workspace.getConfiguration(section, this.scope)
    }

    /**
     * Defines a new set of settings from the specified section.
     *
     * Only use this for creating 'virtual' settings that don't exist within `package.json`.
     * Prefer {@link fromExtensionManifest} for most use-cases.
     */
    public static define<T extends TypeDescriptor>(section: string, descriptor: T) {
        return createSettingsClass(section, descriptor)
    }

    static #instance: Settings

    /**
     * A singleton scoped to the global configuration target.
     */
    public static get instance() {
        return (this.#instance ??= new this())
    }
}

// Keeping a separate function without a return type allows us to infer protected methods
// TODO(sijaden): we can make this better in TS 4.7
function createSettingsClass<T extends TypeDescriptor>(section: string, descriptor: T) {
    type Inner = FromDescriptor<T>

    // Class names are not always stable, especially when bundling
    function makeLogger(name = 'Settings', loglevel: 'debug' | 'error') {
        const prefix = `${isNameMangled() ? 'Settings' : name} (${section})`
        return (message: string) =>
            loglevel === 'debug'
                ? getLogger().debug(`${prefix}: ${message}`)
                : getLogger().error(`${prefix}: ${message}`)
    }

    return class AnonymousSettings implements TypedSettings<Inner> {
        private readonly config = this.settings.getSection(section)
        private readonly disposables: vscode.Disposable[] = []
        // TODO(sijaden): add metadata prop to `Logger` so we don't need to make one-off log functions
        protected readonly log = makeLogger(Object.getPrototypeOf(this)?.constructor?.name, 'debug')
        protected readonly logErr = makeLogger(Object.getPrototypeOf(this)?.constructor?.name, 'error')

        public constructor(private readonly settings: ClassToInterfaceType<Settings> = Settings.instance) {}

        public get onDidChange() {
            return this.getChangedEmitter().event
        }

        public get<K extends keyof Inner>(key: K & string, defaultValue?: Inner[K]) {
            try {
                return this.getOrThrow(key, defaultValue)
            } catch (e) {
                const message = UnknownError.cast(e)
                if (arguments.length === 1) {
                    throw new Error(`Failed to read key "${section}.${key}": ${message}`)
                }

                this.logErr(`using default for key "${key}", read failed: ${message}`)

                return defaultValue as Inner[K]
            }
        }

        public async update<K extends keyof Inner>(key: K & string, value: Inner[K]) {
            try {
                await this.config.update(key, value)

                return true
            } catch (error) {
                this.log(`failed to update field "${key}": ${error}`)

                return false
            }
        }

        public async delete(key: keyof Inner & string) {
            try {
                await this.config.update(key, undefined)

                return true
            } catch (error) {
                this.log(`failed to delete field "${key}": ${error}`)

                return false
            }
        }

        public async reset() {
            try {
                return await this.config.reset()
            } catch (error) {
                this.log(`failed to reset settings: ${error}`)
            }
        }

        public dispose() {
            return vscode.Disposable.from(this.getChangedEmitter(), ...this.disposables).dispose()
        }

        protected getOrThrow<K extends keyof Inner>(key: K & string, defaultValue?: Inner[K]) {
            const value = this.config.get(key, defaultValue)

            return cast<Inner[K]>(value, descriptor[key])
        }

        private readonly getChangedEmitter = once(() => {
            // For a setting `aws.foo.bar`:
            //   - the "section" is `aws.foo`
            //   - the "key" is `bar`
            //
            // So if `aws.foo.bar` changed, this would fire with data `{ key: 'bar' }`
            //
            // Note that `undefined` is not a valid JSON value. So using it as a default
            // value is a valid way to express that the key exists but no (valid) value is set.

            const props = keys(descriptor)
            const store = toRecord(props, p => this.get(p, undefined))
            const emitter = new vscode.EventEmitter<{ readonly key: keyof T }>()
            const listener = this.settings.onDidChangeSection(section, event => {
                const isDifferent = (p: keyof T & string) => {
                    const isDifferentLazy = () => {
                        const previous = store[p]
                        return previous !== (store[p] = this.get(p, undefined))
                    }

                    return event.affectsConfiguration(p) || isDifferentLazy()
                }

                for (const key of props.filter(isDifferent)) {
                    this.log(`key "${key}" changed`)
                    emitter.fire({ key })
                }
            })

            this.disposables.push(emitter, listener)
            return emitter
        })
    }
}

/**
 * A stricter form of {@link vscode.Memento} with type-safe semantics.
 */
export interface TypedSettings<T extends Record<string, any>> extends Omit<ResetableMemento, 'get' | 'update'> {
    /**
     * Gets the value stored at `key`.
     *
     * This will always return the expected type, otherwise an error is thrown.
     */
    get<K extends keyof T>(key: K, defaultValue?: T[K]): T[K]

    /**
     * Updates the value stored at `key`.
     *
     * Errors are always handled, so any issues will cause this method to return `false`.
     */
    update<K extends keyof T>(key: K, value: T[K]): Promise<boolean>

    /**
     * Deletes a key from the settings.
     *
     * This is equivalent to setting the value to `undefined`, though keeping the two
     * concepts separate helps with catching unexpected behavior.
     */
    delete(key: keyof T): Promise<boolean>

    /**
     * Fired whenever a specific configuration changes.
     */
    readonly onDidChange: vscode.Event<{ readonly key: keyof T }>
}

/**
 * Slightly extended form of {@link vscode.Memento}.
 */
export interface ResetableMemento extends vscode.Memento {
    /**
     * Resets the entire underlying store.
     *
     * A reset can be thought of as setting an imaginary 'root' key to `undefined`.
     */
    reset(): Promise<void>
}

// The below types are used to split-out 'sections' from `package.json`
// Obviously not ideal, but the alternative is to generate the properties
// from implementations. Using types requires basically no logic but lacks
// precision. We still need to manually specify what type something should be,
// at least for anything beyond primitive types.
const settingsProps = packageJson.contributes.configuration.properties

type SettingsProps = typeof settingsProps

type Split<T, S extends string> = T extends `${infer L}${S}${infer R}` ? [L, ...Split<R, S>] : [T]
type Pop<T> = T extends [...infer R, infer _] ? R : never
type Intersection<T> = (T extends any ? (_: T) => any : never) extends (_: infer U) => any ? U : never

type FromParts<T, K> = K extends [infer U, ...infer R]
    ? [U, R] extends [string, string[]]
        ? { [P in U & string]: FromParts<T, R> }
        : T
    : T

type Format<T> = { [P in keyof T]: FromParts<TypeConstructor, Split<P, '.'>> }[keyof T]
type Config = Intersection<Format<SettingsProps>>

type Join<T extends string[], S extends string> = T['length'] extends 1
    ? T[0]
    : T extends [infer L, ...infer R]
    ? L extends string
        ? R extends string[]
            ? `${L}${S}${Join<R, S>}`
            : ''
        : ''
    : never

type Select<T, K> = K extends [infer L, ...infer R]
    ? L extends keyof T
        ? R['length'] extends 0
            ? T[L]
            : Select<T[L], R>
        : never
    : never

type Sections = { [P in keyof SettingsProps as Join<Pop<Split<P, '.'>>, '.'>]: Select<Config, Pop<Split<P, '.'>>> }

/**
 * Creates a class for manipulating specific sections of settings specified in `package.json`.
 *
 * A 'section' is the combined namespaces of a key, e.g. `aws.foo.bar` is within the section `aws.foo`.
 * From a section, callers can specify which keys they want to use as well as how it should be parsed.
 * The returned class will be a valid implementation of {@link TypedSettings}. Declared settings keys
 * are validated against `package.json` to ensure they exist.
 *
 * ### Examples
 * #### Pass-through:
 * ```
 * export class CloudWatchLogsSettings extends fromExtensionManifest('aws.cloudWatchLogs', { limit: Number }) {}
 *
 * const settings = new CloudWatchLogsSettings()
 * const limit = settings.get('limit', 1000)
 * ```
 *
 * #### Extending:
 * ```
 * export class TelemetryConfig extends fromExtensionManifest('aws', { telemetry: Boolean }) {
 *     public isEnabled(): boolean {
 *         try {
 *             return this.get('telemetry', TELEMETRY_SETTING_DEFAULT)
 *         } catch (error) {
 *              vscode.window.showErrorMessage(
 *                  localize(
 *                      'AWS.message.error.settings.telemetry.invalid_type',
 *                      'The aws.telemetry value must be a boolean'
 *                  )
 *              )
 *
 *              return TELEMETRY_SETTING_DEFAULT
 *         }
 *     }
 * }
 * ```
 *
 * @param section Section used to create the class
 * @param descriptor A {@link TypeDescriptor} that maps keys to a concrete type
 *
 * @returns A class that can be used as-is or inherited from
 */
export function fromExtensionManifest<T extends TypeDescriptor & Partial<Sections[K]>, K extends keyof Sections>(
    section: K,
    descriptor: T
) {
    // The function signature is intentionally loose to allow for partial implementations.
    // Runtime validation is required to ensure things are correct.
    //
    // Assumptions:
    // - `fromExtensionManifest` is called exclusively on module load
    // - The extension loads all modules before activating
    //
    // As long as the above holds true, throwing an error here will always be caught by CI

    const resolved = keys(descriptor).map(k => `${section}.${k}`)
    const missing = resolved.filter(k => (settingsProps as Record<string, any>)[k] === undefined)

    if (missing.length > 0) {
        const message = `The following configuration keys were missing from package.json: ${missing.join(', ')}`
        getLogger().error(`Settings (fromExtensionManifest): missing fields:\n${missing.map(k => `\t${k}`).join('\n')}`)

        throw new Error(message)
    }

    return Settings.define(section, descriptor)
}

const prompts = settingsProps['aws.suppressPrompts'].properties
type PromptName = keyof typeof prompts

/**
 * Controls flags for prompts that allow the user to hide them. Usually this is presented as
 * some variation of "Don't show again".
 *
 * ### Usage:
 * ```
 * if (await settings.isPromptEnabled('myPromptName')) {
 *     // Show some sort of prompt
 *     const userResponse = await promptUser()
 *
 *     // Then check if we should disable it
 *     if (userResponse === "Don't show again") {
 *         settings.disablePrompt('myPromptName')
 *     }
 * }
 * ```
 */
export class PromptSettings extends Settings.define(
    'aws.suppressPrompts',
    toRecord(keys(prompts), () => Boolean)
) {
    public async isPromptEnabled(promptName: PromptName): Promise<boolean> {
        try {
            return !this.getOrThrow(promptName, false)
        } catch (error) {
            this.log(`prompt check for "${promptName}" failed: ${error}`)
            await this.reset()

            return true
        }
    }

    public async disablePrompt(promptName: PromptName): Promise<void> {
        if (await this.isPromptEnabled(promptName)) {
            await this.update(promptName, true)
        }
    }

    static #instance: PromptSettings

    public static get instance() {
        return (this.#instance ??= new this())
    }
}

const experiments = settingsProps['aws.experiments'].properties
type ExperimentName = keyof typeof experiments

/**
 * "Experiments" are for features that users must opt-in to use. Experimental implementations
 * should use this class to gate relevant functionality. Certain features, like adding a new
 * node to the tree view, may require notifications based on changes. Use the `onDidChange` event
 * to refresh state as-needed in this scenario.
 *
 * ### Usage:
 * ```
 * function myExperimentalFeature(): void {
 *   if (!(await settings.isExperimentEnabled('myExperimentalFeature'))) {
 *       return
 *   }
 *
 *   // Rest of the feature
 * }
 *
 * settings.onDidChange(({ key }) => {
 *    if (key === 'myExperimentalFeature') {
 *        // Refresh trees, webviews, etc.
 *    }
 * })
 * ```
 */
export class Experiments extends Settings.define(
    'aws.experiments',
    toRecord(keys(experiments), () => Boolean)
) {
    public async isExperimentEnabled(name: ExperimentName): Promise<boolean> {
        try {
            return this.getOrThrow(name, false)
        } catch (error) {
            this.log(`experiment check for ${name} failed: ${error}`)
            await this.reset()

            return false
        }
    }

    static #instance: Experiments

    public static get instance() {
        return (this.#instance ??= new this())
    }
}

const DEV_SETTINGS = {
    forceCloud9: Boolean,
    forceDevMode: Boolean,
    forceInstallTools: Boolean,
    telemetryEndpoint: String,
    telemetryUserPool: String,
    mdeBetaEndpoint: String,
    mdeEmailFilter: Boolean,
    enableSsoProvider: Boolean,
    cawsStage: String,
}

type ResolvedDevSettings = FromDescriptor<typeof DEV_SETTINGS>
type AwsDevSetting = keyof ResolvedDevSettings

/**
 * Developer settings are intended to be used by developers of this codebase for anything
 * that may be potentially useful during active development and/or testing. Examples include
 * forcing certain behaviors, changing hard-coded endpoints, emitting extra debug info, etc.
 *
 * These settings should _not_ be placed in `package.json` as they are not meant to be seen by
 * the average user. Instead, add a new field to {@link DEV_SETTINGS this object} with the
 * desired name/type.
 *
 * Note that a default value _must_ be supplied when calling {@link get} because developer
 * settings are intentional deviations from the default. Always using a default helps to
 * ensure that behavior is well-defined and isolated. Calls to {@link get} will not throw
 * an error, even for bad types, unless the code is ran from automated tests. The supplied
 * default will be used in case any errors occur in non-testing environment.
 *
 * ### Usage:
 * ```
 * // Use the `instance` field to retrieve the object
 * const devSettings = DevSettings.instance
 *
 * // Override some endpoint for an SDK client
 * const myEndpoint = devSettings.get('myEndpoint', DEFAULT_ENDPOINT)
 * const myClient = new MyClient({ endpoint: myEndpoint })
 *
 * // Potentially register an event (if needed)
 * devSettings.onDidChange(({ key }) => {
 *     // Do something based off what changed
 * })
 * ```
 */
export class DevSettings extends Settings.define('aws.dev', DEV_SETTINGS) {
    private readonly trappedSettings: Partial<ResolvedDevSettings> = {}
    private readonly onDidChangeActiveSettingsEmitter = new vscode.EventEmitter<void>()

    public readonly onDidChangeActiveSettings = this.onDidChangeActiveSettingsEmitter.event

    public get activeSettings(): Readonly<typeof this.trappedSettings> {
        return this.trappedSettings
    }

    public override get<K extends AwsDevSetting>(key: K, defaultValue: ResolvedDevSettings[K]) {
        const result = super.get(key, defaultValue)

        if (result !== defaultValue) {
            this.trap(key, result)
        }

        return result
    }

    private trap<K extends AwsDevSetting>(key: K, value: ResolvedDevSettings[K]) {
        if (this.trappedSettings[key] !== value) {
            this.trappedSettings[key] = value
            this.onDidChangeActiveSettingsEmitter.fire()
        }
    }

    static #instance: DevSettings

    public static get instance() {
        const instance = (this.#instance ??= new this())
        instance.get('forceDevMode', false)

        return instance
    }
}

/**
 * Simple utility function to 'migrate' a setting from one key to another.
 *
 * Currently only used for simple migrations where we are not concerned about maintaining the
 * legacy definition. Only migrates to global settings.
 */
export async function migrateSetting<T, U = T>(
    from: { key: string; type: TypeConstructor<T> },
    to: { key: string; transform?: (value: T) => U }
) {
    // TODO(sijaden): we should handle other targets besides 'global'
    const config = vscode.workspace.getConfiguration()
    const hasLatest = config.inspect(to.key)?.globalValue !== undefined
    const logPrefix = `Settings migration ("${from.key}" -> "${to.key}")`

    if (hasLatest || !config.has(from.key)) {
        return true
    }

    try {
        const oldVal = cast(config.get(from.key), from.type)
        const newVal = to.transform?.(oldVal) ?? oldVal

        await config.update(to.key, newVal, vscode.ConfigurationTarget.Global)
        getLogger().debug(`${logPrefix}: succeeded`)

        return true
    } catch (error) {
        getLogger().verbose(`${logPrefix}: failed: ${error}`)

        return false
    }
}

/**
 * Opens the settings UI at the specified key.
 *
 * This only works for keys that are considered "top-level", e.g. keys of {@link settingsProps}.
 */
export async function openSettings<K extends keyof SettingsProps>(key: K): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.openSettings', `@id:${key}`)
}
