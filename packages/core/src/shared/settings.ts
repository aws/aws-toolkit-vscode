/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as codecatalyst from './clients/codecatalystClient'
import * as codewhisperer from '../codewhisperer/client/codewhisperer'
import packageJson from '../../package.json'
import { getLogger } from './logger'
import { cast, FromDescriptor, Record, TypeConstructor, TypeDescriptor } from './utilities/typeConstructors'
import { assertHasProps, ClassToInterfaceType, keys } from './utilities/tsUtils'
import { toRecord } from './utilities/collectionUtils'
import { isNameMangled } from './vscode/env'
import { once, onceChanged } from './utilities/functionUtils'
import { ToolkitError } from './errors'
import { telemetry } from './telemetry/telemetry'
import globals from './extensionGlobals'

type Workspace = Pick<typeof vscode.workspace, 'getConfiguration' | 'onDidChangeConfiguration'>

/** Used by isReadable(). Must be something that's defined in our package.json. */
export const testSetting = 'aws.samcli.lambdaTimeout'

export async function showSettingsFailedMsg(kind: 'read' | 'update', key?: string) {
    const keyMsg = key ? ` (key: "${key}")` : ''
    const msg = `Failed to ${kind} settings${keyMsg}. Check settings.json for syntax errors or insufficient permissions.`
    const openSettingsItem = 'Open settings.json'
    const logsItem = 'View Logs...'

    const items = [openSettingsItem, logsItem]
    const p = vscode.window.showErrorMessage(msg, {}, ...items)
    return p.then<string | undefined>(async selection => {
        if (selection === logsItem) {
            globals.logOutputChannel.show(true)
        } else if (selection === openSettingsItem) {
            await vscode.commands.executeCommand('workbench.action.openSettingsJson')
        }
        return selection
    })
}

/**
 * Shows an error message if we couldn't update settings, unless the last message was for the same `key`.
 */
const showSettingsUpdateFailedMsgOnce = onceChanged(key => {
    // Edge cases:
    //  - settings.json may intentionally be readonly. #4043
    //  - settings.json may be open in multiple vscodes. #4453
    //  - vscode will show its own error if settings.json cannot be written.
    void showSettingsFailedMsg('update', key)

    telemetry.aws_modifySetting.emit({ result: 'Failed', reason: 'UserSettingsWrite', settingId: key })
})

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
        private readonly updateTarget = vscode.ConfigurationTarget.Global,
        private readonly scope: vscode.ConfigurationScope | undefined = undefined,
        private readonly workspace: Workspace = vscode.workspace
    ) {}

    /**
     * Gets a setting value, applying the {@link TypeConstructor} if provided.
     *
     * If the read fails or the setting value is invalid (does not conform to `type`):
     * - `defaultValue` is returned if it was provided
     * - else an exception is thrown
     *
     * @note An unknown setting is indistinguisable from a missing value: both return `undefined`.
     * Non-existent values are returned as-is without passing through the type cast.
     *
     * @param key Setting name
     * @param type Expected setting type
     * @param defaultValue Value returned if setting is missing or invalid
     */
    public get(key: string): unknown
    public get<T>(key: string, type: TypeConstructor<T>): T | undefined
    public get<T>(key: string, type: TypeConstructor<T>, defaultValue: T): T
    public get<T>(key: string, type?: TypeConstructor<T>, defaultValue?: T) {
        try {
            const value = this.getConfig().get(key, defaultValue)

            return !type || value === undefined ? value : cast(value, type)
        } catch (e) {
            if (arguments.length <= 2) {
                throw ToolkitError.chain(e, `Failed to read setting "${key}"`)
            }
            getLogger().error('settings: failed to read "%s": %s', key, (e as Error).message)

            return defaultValue
        }
    }

    /**
     * Attempts to write to the settings.
     *
     * Settings can only be written if the extension contributes the specified key in its
     * `package.json`, else the write will fail and this method will return false.
     *
     * Writing to settings may fail if the user does not have write permissions, or settings.json is
     * corrupted, or some other requirement is not met (for example, the
     * `vscode.ConfigurationTarget.Workspace` target requires a workspace).
     */
    public async update(key: string, value: unknown): Promise<boolean> {
        const config = this.getConfig()
        try {
            await config.update(key, value, this.updateTarget)

            return true
        } catch (e) {
            const fullKey = config.inspect(key)?.key ?? key
            getLogger().warn('settings: failed to update "%s": %s', fullKey, (e as Error).message)
            showSettingsUpdateFailedMsgOnce(fullKey)

            return false
        }
    }

    /**
     * Checks that user `settings.json` is readable. #3910
     *
     * Note: Does NOT check that we can "roundtrip" (read-and-write) settings. vscode notifies the
     * user if settings.json is complete nonsense, but silently fails if there are only
     * "recoverable" JSON syntax errors. We can't test for "roundtrip" on _startup_ because it causes
     * race conditions if multiple VSCode instances start simultaneously. #4453
     * Instead we handle that in {@link Settings#update()}.
     */
    public async isReadable(): Promise<boolean> {
        const key = testSetting
        const config = this.getConfig()

        try {
            config.get<number>(key)

            return true
        } catch (e) {
            const err = e as Error
            const logMsg = 'settings: invalid settings.json: %s'
            getLogger().error(logMsg, err.message)

            return false
        }
    }

    /**
     * Checks if the key has been set in any non-language scope.
     */
    public isSet(key: string, section?: string): boolean {
        const config = this.getConfig(section)
        const info = config.inspect(key)

        return (
            info?.globalValue !== undefined ||
            info?.workspaceValue !== undefined ||
            info?.workspaceFolderValue !== undefined
        )
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
        const [targetKey, parentSection] = splitKey(section)

        return {
            keys: () => [], // TODO(jmkeyes): implement this?
            get: (key, defaultValue?) => this.getConfig(section).get(key, defaultValue),
            reset: async () => this.getConfig().update(section, undefined, this.updateTarget),
            update: async (key, value) => {
                // VS Code's settings API can read nested props but not write to them.
                // We need to write to the parent if we cannot write to the child.
                //
                // TODO(sijaden): potentially provide valid keys upfront to avoid needing to
                // handle this asymmetry with try/catch

                try {
                    return await this.getConfig(section).update(key, value, this.updateTarget)
                } catch (error) {
                    const parent = this.getConfig(parentSection)
                    const val = parent.get(targetKey)

                    if (typeof val === 'object') {
                        return parent.update(targetKey, { ...val, [key]: value }, this.updateTarget)
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
        // eslint-disable-next-line unicorn/no-null
        return this.workspace.getConfiguration(section, this.scope ?? null)
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
     * A singleton scoped to the global configuration target and `null` resource.
     */
    public static get instance() {
        return (this.#instance ??= new this())
    }
}

/**
 * Splits a key into 'leaf' and 'section' components.
 *
 * The leaf is assumed to be the last dot-separated component. Example:
 *
 * ```ts
 * const [leaf, section] = this.split('aws.cloudWatchLogs.limit')
 * console.log(leaf, section) // aws.cloudWatchLogs limit
 * ```
 */
function splitKey(key: string): [leaf: string, section: string] {
    const parts = key.split('.')
    const leaf = parts.pop() ?? key
    const section = parts.join('.')

    return [leaf, section]
}

// Keeping a separate function without a return type allows us to infer protected methods
// TODO(sijaden): we can make this better in TS 4.7
function createSettingsClass<T extends TypeDescriptor>(section: string, descriptor: T) {
    type Inner = FromDescriptor<T>

    // Class names are not always stable, especially when bundling
    function makeLogger(name = 'Settings', loglevel: 'debug' | 'error') {
        const prefix = `${isNameMangled() ? 'Settings' : name} (${section})`
        return (message: string, ...meta: any[]) =>
            loglevel === 'debug'
                ? getLogger().debug(`${prefix}: ${message}`, ...meta)
                : getLogger().error(`${prefix}: ${message}`, ...meta)
    }

    return class AnonymousSettings implements TypedSettings<Inner> {
        readonly #settings: ClassToInterfaceType<Settings>
        readonly #config: ResetableMemento
        readonly #disposables: vscode.Disposable[] = []
        // TODO(sijaden): add metadata prop to `Logger` so we don't need to make one-off log functions
        public readonly _log = makeLogger(Object.getPrototypeOf(this)?.constructor?.name, 'debug')
        public readonly _logErr = makeLogger(Object.getPrototypeOf(this)?.constructor?.name, 'error')

        public constructor(settings: ClassToInterfaceType<Settings> = Settings.instance) {
            this.#settings = settings
            this.#config = this.#settings.getSection(section)
        }

        public get onDidChange() {
            return this.#getChangedEmitter().event
        }

        public keys(): readonly string[] {
            return this.#config.keys()
        }

        /**
         * Gets a setting value.
         *
         * If the read fails or the setting value is invalid (does not conform to the type defined in package.json):
         * - `defaultValue` is returned if it was provided
         * - else an exception is thrown
         *
         * @param key Setting name
         * @param defaultValue Value returned if setting is missing or invalid
         */
        public get<K extends keyof Inner>(key: K & string, defaultValue?: Inner[K]) {
            try {
                return this._getOrThrow(key, defaultValue)
            } catch (e) {
                if (arguments.length === 1) {
                    throw ToolkitError.chain(e, `Failed to read key "${section}.${key}"`)
                }
                this._logErr('failed to read "%s": %s', key, (e as Error).message)

                return defaultValue as Inner[K]
            }
        }

        public async update<K extends keyof Inner>(key: K & string, value: Inner[K]) {
            try {
                await this.#config.update(key, value)

                return true
            } catch (e) {
                const fullKey = `${section}.${key}`
                showSettingsUpdateFailedMsgOnce(fullKey)
                this._log('failed to update "%s": %s', key, (e as Error).message)

                return false
            }
        }

        public async delete(key: keyof Inner & string) {
            try {
                await this.#config.update(key, undefined)

                return true
            } catch (e) {
                const fullKey = `${section}.${key}`
                showSettingsUpdateFailedMsgOnce(fullKey)
                this._log('failed to delete "%s": %s', key, (e as Error).message)

                return false
            }
        }

        public async reset() {
            try {
                return await this.#config.reset()
            } catch (e) {
                this._log('failed to reset settings: %s', (e as Error).message)
            }
        }

        public dispose() {
            return vscode.Disposable.from(this.#getChangedEmitter(), ...this.#disposables).dispose()
        }

        public _isSet(key: keyof Inner & string) {
            return this.#settings.isSet(key, section)
        }

        public _getOrThrow<K extends keyof Inner>(key: K & string, defaultValue?: Inner[K]) {
            const value = this.#config.get(key, defaultValue)

            return cast<Inner[K]>(value, descriptor[key])
        }

        public _getOrUndefined<K extends keyof Inner>(key: K & string) {
            const value = this.#config.get(key)
            if (value === undefined) {
                return value
            }

            return this.get(key, undefined)
        }

        readonly #getChangedEmitter = once(() => {
            // For a setting `aws.foo.bar`:
            //   - the "section" is `aws.foo`
            //   - the "key" is `bar`
            //
            // So if `aws.foo.bar` changed, this would fire with data `{ key: 'bar' }`
            //
            // Note that `undefined` is not a valid JSON value. So using it as a default
            // value is a valid way to express that the key exists but no (valid) value is set.

            const props = keys(descriptor)
            const store = toRecord(props, p => this._getOrUndefined(p))
            const emitter = new vscode.EventEmitter<{ readonly key: keyof T }>()
            const listener = this.#settings.onDidChangeSection(section, event => {
                const isDifferent = (p: keyof T & string) => {
                    const isDifferentLazy = () => {
                        const previous = store[p]
                        return previous !== (store[p] = this._getOrUndefined(p))
                    }

                    return event.affectsConfiguration(p) || isDifferentLazy()
                }

                for (const key of props.filter(isDifferent)) {
                    this._log('key "%s" changed', key)
                    emitter.fire({ key })
                }
            })

            this.#disposables.push(emitter, listener)
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
     * Always returns the expected type, or throws an error.
     */
    get<K extends keyof T>(key: K, defaultValue?: T[K]): T[K]

    /**
     * Updates the value stored at `key`.
     *
     * Errors are caught and silently logged, and return `false`.
     */
    update<K extends keyof T>(key: K, value: T[K]): Promise<boolean>

    /**
     * Deletes a key from the settings.
     *
     * Equivalent to setting the value to `undefined`, but keeping the two concepts separate helps
     * with catching unexpected behavior.
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
 * export class CloudWatchLogsSettings extends fromExtensionManifest('aws.cwl', { limit: Number }) {}
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

/**
 * PromptSettings
 *
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
 *
 * There are individual implementations for the Toolkit extension and Amazon Q extension.
 * This is a temporary workaround to get compile time checking and runtime fetching
 * of settings working.
 *
 * TODO: Settings should be defined in individual extensions, and passed to the
 * core lib as necessary.
 */
export const toolkitPrompts = settingsProps['aws.suppressPrompts'].properties
type toolkitPromptName = keyof typeof toolkitPrompts
export class ToolkitPromptSettings extends Settings.define(
    'aws.suppressPrompts',
    toRecord(keys(toolkitPrompts), () => Boolean)
) {
    public async isPromptEnabled(promptName: toolkitPromptName): Promise<boolean> {
        try {
            return !this._getOrThrow(promptName, false)
        } catch (e) {
            this._log('prompt check for "%s" failed: %s', promptName, (e as Error).message)
            await this.reset()

            return true
        }
    }

    public async disablePrompt(promptName: toolkitPromptName): Promise<void> {
        if (await this.isPromptEnabled(promptName)) {
            await this.update(promptName, true)
        }
    }

    static #instance: ToolkitPromptSettings

    public static get instance() {
        return (this.#instance ??= new this())
    }
}

export const amazonQPrompts = settingsProps['aws.amazonQ.suppressPrompts'].properties
type amazonQPromptName = keyof typeof amazonQPrompts
export class AmazonQPromptSettings extends Settings.define(
    'aws.amazonQ.suppressPrompts',
    toRecord(keys(amazonQPrompts), () => Boolean)
) {
    public async isPromptEnabled(promptName: amazonQPromptName): Promise<boolean> {
        try {
            return !this._getOrThrow(promptName, false)
        } catch (e) {
            this._log('prompt check for "%s" failed: %s', promptName, (e as Error).message)
            await this.reset()

            return true
        }
    }

    public async disablePrompt(promptName: amazonQPromptName): Promise<void> {
        if (await this.isPromptEnabled(promptName)) {
            await this.update(promptName, true)
        }
    }

    static #instance: AmazonQPromptSettings

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
            return this._getOrThrow(name, false)
        } catch (error) {
            this._log(`experiment check for ${name} failed: %s`, error)
            await this.reset()

            return false
        }
    }

    static #instance: Experiments

    public static get instance() {
        return (this.#instance ??= new this())
    }
}

const devSettings = {
    logfile: String,
    forceCloud9: Boolean,
    forceDevMode: Boolean,
    forceInstallTools: Boolean,
    telemetryEndpoint: String,
    telemetryUserPool: String,
    renderDebugDetails: Boolean,
    endpoints: Record(String, String),
    codecatalystService: Record(String, String),
    codewhispererService: Record(String, String),
    ssoCacheDirectory: String,
    pkceAuth: Boolean,
}
type ResolvedDevSettings = FromDescriptor<typeof devSettings>
type AwsDevSetting = keyof ResolvedDevSettings

type ServiceClients = keyof ServiceTypeMap
interface ServiceTypeMap {
    codecatalystService: codecatalyst.CodeCatalystConfig
    codewhispererService: codewhisperer.CodeWhispererConfig
}

/**
 * Developer settings are intended to be used by developers of this codebase for anything
 * that may be potentially useful during active development and/or testing. Examples include
 * forcing certain behaviors, changing hard-coded endpoints, emitting extra debug info, etc.
 *
 * These settings should _not_ be placed in `package.json` as they are not meant to be seen by
 * the average user. Instead, add a new field to {@link devSettings this object} with the
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
export class DevSettings extends Settings.define('aws.dev', devSettings) {
    private readonly trappedSettings: Partial<ResolvedDevSettings> = {}
    private readonly onDidChangeActiveSettingsEmitter = new vscode.EventEmitter<void>()

    public readonly onDidChangeActiveSettings = this.onDidChangeActiveSettingsEmitter.event

    public get activeSettings(): Readonly<typeof this.trappedSettings> {
        return this.trappedSettings
    }

    public isDevMode(): boolean {
        // This setting takes precedence over everything.
        // It must be removed completely from the settings to not be considered.
        const forceDevMode: boolean | undefined = this._isSet('forceDevMode')
            ? this.get('forceDevMode', false)
            : undefined
        if (forceDevMode !== undefined) {
            return forceDevMode
        }

        // forceDevMode was not defined, so check other dev settings
        return Object.keys(this.activeSettings).length > 0
    }

    public getServiceConfig<T extends ServiceClients>(
        devSetting: T,
        defaultConfig: ServiceTypeMap[T]
    ): Readonly<ServiceTypeMap[T]> {
        const devConfig = this.get<ServiceClients>(devSetting, {})

        if (Object.keys(devConfig).length === 0) {
            this.logConfigOnce(devSetting, 'default')
            return defaultConfig
        }

        try {
            // The configuration in dev settings should explicitly override the entire default configuration.
            assertHasProps(devConfig, ...Object.keys(defaultConfig))
        } catch (err) {
            throw ToolkitError.chain(err, `Dev setting '${devSetting}' has missing or invalid properties.`)
        }

        this.logConfigOnce(devSetting, JSON.stringify(devConfig, undefined, 4))
        return devConfig as unknown as ServiceTypeMap[T]
    }

    public override get<K extends AwsDevSetting>(key: K, defaultValue: ResolvedDevSettings[K]) {
        if (!this._isSet(key)) {
            this.unset(key)

            return defaultValue
        }

        const result = super.get(key, defaultValue)
        this.trap(key, result)

        return result
    }

    private trap<K extends AwsDevSetting>(key: K, value: ResolvedDevSettings[K]) {
        if (this.trappedSettings[key] !== value) {
            this.trappedSettings[key] = value
            this.onDidChangeActiveSettingsEmitter.fire()
        }
    }

    private unset(key: AwsDevSetting) {
        if (key in this.trappedSettings) {
            delete this.trappedSettings[key]
            this.onDidChangeActiveSettingsEmitter.fire()
        }
    }

    private logConfigOnce = onceChanged((serviceName, val) => {
        getLogger().info(`using ${serviceName} service configuration: ${val}`)
    })

    static #instance: DevSettings

    public static get instance() {
        if (this.#instance === undefined) {
            this.#instance = new this()
        }

        return this.#instance
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
        getLogger().verbose(`${logPrefix}: failed: %s`, error)

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

/**
 * Deprecated settings that users on old versions may have.
 */
const deprecatedSettings = [
    'aws.codeWhisperer.includeSuggestionsWithCodeReferences',
    'aws.codeWhisperer.importRecommendation',
    'aws.codeWhisperer.shareCodeWhispererContentWithAWS',
    'aws.codeWhisperer.javaCompilationOutput',
] as const

export type DeprecatedSetting = (typeof deprecatedSettings)[number]

/**
 * Import the setting value of an old setting into a new setting, if the old setting exists.
 * Useful for setting renames.
 *
 * newKey must be defined in the extension, e.g. keys of {@link settingsProps}.
 */
export async function tryImportSetting(oldKey: DeprecatedSetting, newKey: keyof SettingsProps) {
    getLogger().debug(`trying to import setting '${oldKey}' into '${newKey}'`)

    const newSettingInfo = vscode.workspace.getConfiguration().inspect(newKey)
    if (newSettingInfo && (newSettingInfo.workspaceValue !== undefined || newSettingInfo.globalValue !== undefined)) {
        getLogger().debug(`'${newKey}' is already set, skipping import`)
        return
    }

    const oldSettingInfo = vscode.workspace.getConfiguration().inspect(oldKey)
    if (oldSettingInfo) {
        if (oldSettingInfo.workspaceValue !== undefined) {
            await vscode.workspace
                .getConfiguration()
                .update(newKey, oldSettingInfo.workspaceValue, vscode.ConfigurationTarget.Workspace)
            getLogger().info(`imported workspace setting '${oldKey}' into '${newKey}'`)
        }
        if (oldSettingInfo.globalValue !== undefined) {
            await vscode.workspace
                .getConfiguration()
                .update(newKey, oldSettingInfo.globalValue, vscode.ConfigurationTarget.Global)
            getLogger().info(`imported global setting '${oldKey}' into '${newKey}'`)
        }
    }
}
