/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from './logger/logger'
import * as redshift from '../awsService/redshift/models/models'
import { TypeConstructor, cast } from './utilities/typeConstructors'

type ToolId = 'codecatalyst' | 'codewhisperer' | 'testId'
export type ToolIdStateKey = `${ToolId}.savedConnectionId`

export type JsonSchemasKey = 'devfileSchemaVersion' | 'samAndCfnSchemaVersion'

type samInitStateKey =
    | 'ACTIVATION_TEMPLATE_PATH_KEY'
    | 'ACTIVATION_LAUNCH_PATH_KEY'
    | 'SAM_INIT_RUNTIME_KEY'
    | 'SAM_INIT_IMAGE_BOOLEAN_KEY'
    | 'SAM_INIT_ARCH_KEY'

type stepFunctionsKey = 'SCRIPT_LAST_DOWNLOADED_URL' | 'CSS_LAST_DOWNLOADED_URL'

export type globalKey =
    | samInitStateKey
    | stepFunctionsKey
    | ToolIdStateKey
    | JsonSchemasKey
    | 'amazonq.telemetry.migrated'
    | 'aws.amazonq.codewhisperer.newCustomizations'
    | 'aws.amazonq.hasShownWalkthrough'
    | 'aws.amazonq.showTryChatCodeLens'
    | 'aws.amazonq.securityIssueFilters'
    | 'aws.amazonq.notifications'
    | 'aws.amazonq.welcomeChatShowCount'
    | 'aws.amazonq.disclaimerAcknowledged'
    | 'aws.notifications'
    | 'aws.notifications.dev' // keys to store notifications for testing
    | 'aws.downloadPath'
    | 'aws.lastTouchedS3Folder'
    | 'aws.lastUploadedToS3Folder'
    | 'aws.redshift.connections'
    | 'aws.toolkit.amazonq.dismissed'
    | 'aws.toolkit.amazonqInstall.dismissed'
    | 'aws.amazonq.workspaceIndexToggleOn'
    // Deprecated/legacy names. New keys should start with "aws.".
    | '#sessionCreationDates' // Legacy name from `ssoAccessTokenProvider.ts`.
    | 'CODECATALYST_RECONNECT'
    | 'CODEWHISPERER_AUTO_SCANS_ENABLED'
    | 'CODEWHISPERER_AUTO_TRIGGER_ENABLED'
    | 'CODEWHISPERER_HINT_DISPLAYED'
    | 'CODEWHISPERER_PERSISTED_CUSTOMIZATIONS'
    | 'CODEWHISPERER_SELECTED_CUSTOMIZATION'
    | 'CODEWHISPERER_USER_GROUP'
    | 'awsTelemetryNoticeVersionAck'
    | 'codecatalyst.connections'
    | 'dev.beta'
    | 'globalsMostRecentVersion'
    | 'gumby.wasQCodeTransformationUsed'
    | 'isExtensionFirstUse'
    | 'lastExtensionVersion'
    | 'lastSelectedRegion'
    | 'lastOsStartTime'
    | 'recentCredentials'
    // List of regions enabled in AWS Explorer.
    | 'region'
    // TODO: implement this via `PromptSettings` instead of globalState.
    | 'sam.sync.updateMessage'
    | 'telemetryClientId'
    | 'telemetryId'
    | 'aws.toolkit.lambda.walkthroughSelected'
    | 'aws.toolkit.lambda.walkthroughCompleted'
    | 'aws.toolkit.appComposer.templateToOpenOnStart'

/**
 * Extension-local (not visible to other vscode extensions) shared state which persists after IDE
 * restart. Shared with all instances (or tabs, in a web browser) of this extension for a given
 * user, including "remote" instances!
 *
 * Note: Global state should be avoided, except when absolutely necessary.
 *
 * This wrapper adds structure and visibility to the vscode `globalState` interface. It also opens
 * the door for:
 * - validation
 * - garbage collection
 */
export class GlobalState implements vscode.Memento {
    constructor(protected readonly memento: vscode.Memento) {}

    keys(): readonly string[] {
        return this.memento.keys()
    }

    values() {
        return this.memento.keys().map((k) => this.memento.get(k))
    }

    /**
     * Gets the value for `key` if it satisfies the `type` specification, or fails.
     *
     * @param key Key name
     * @param type Type validator function, or primitive type constructor such as {@link Object},
     * {@link String}, {@link Boolean}, etc.
     * @param defaultVal Value returned if `key` has no value.
     */
    getStrict<T>(key: globalKey, type: TypeConstructor<T>, defaultVal?: T) {
        try {
            const val = this.memento.get<T>(key) ?? defaultVal
            return !type || val === undefined ? val : cast(val, type)
        } catch (e) {
            const msg = `GlobalState: invalid state (or read failed) for key: "${key}"`
            // XXX: ToolkitError causes circular dependency
            // throw ToolkitError.chain(e, `Failed to read globalState: "${key}"`)
            const err = new Error(msg) as Error & {
                code: string
                cause: unknown
            }
            err.cause = e
            err.code = 'GlobalState'
            throw err
        }
    }

    /**
     * Gets the value at `key`, without type-checking. See {@link tryGet} and {@link getStrict} for type-checking variants.
     *
     * @param key Key name
     * @param defaultVal Value returned if `key` has no value.
     */
    get<T>(key: globalKey, defaultVal?: T): T | undefined {
        const skip = (o: any) => o as T // Don't type check.
        return this.getStrict(key, skip, defaultVal)
    }

    /**
     * Gets the value for `key` if it satisfies the `type` specification, else logs an error and returns `defaultVal`.
     *
     * @param key Key name
     * @param type Type validator function, or primitive type constructor such as {@link Object},
     * {@link String}, {@link Boolean}, etc.
     * @param defaultVal Value returned if `key` has no value.
     */
    tryGet<T>(key: globalKey, type: TypeConstructor<T>): T | undefined
    tryGet<T>(key: globalKey, type: TypeConstructor<T>, defaultVal: T): T
    tryGet<T>(key: globalKey, type: TypeConstructor<T>, defaultVal?: T): T | undefined {
        try {
            return this.getStrict(key, type, defaultVal)
        } catch (e) {
            getLogger().error('%s', (e as Error).message)
            return defaultVal
        }
    }

    /**
     * Asynchronously updates globalState, or logs an error on failure.
     *
     * Only for callers that cannot `await` or don't care about errors and race conditions. Prefer
     * `await update()` where possible.
     */
    tryUpdate(key: globalKey, value: any): void {
        this.update(key, value).then(undefined, () => {
            // Errors are logged by update().
        })
    }

    async update(key: globalKey, value: any): Promise<void> {
        try {
            await this.memento.update(key, value)
        } catch (e) {
            getLogger().error('GlobalState: failed to set "%s": %s', key, (e as Error).message)
            throw e
        }
    }

    clear() {
        return Promise.allSettled(this.memento.keys().map((k) => this.memento.update(k, undefined)))
    }

    /**
     * Stores Redshift connection info for the specified warehouse ARN.
     *
     * TODO: this never garbage-collects old connections, so the state will grow forever...
     *
     * @param warehouseArn redshift warehouse ARN
     * @param cxnInfo Connection info. Value is 'DELETE_CONNECTION' when the connection is deleted
     * but the explorer node is not refreshed yet.
     */
    async saveRedshiftConnection(
        warehouseArn: string,
        cxnInfo: redshift.ConnectionParams | undefined | 'DELETE_CONNECTION'
    ) {
        const allCxns = this.tryGet('aws.redshift.connections', Object, {})
        await this.update('aws.redshift.connections', {
            ...allCxns,
            [warehouseArn]: cxnInfo,
        })
    }

    /**
     * Get the Redshift connection info for the specified warehouse ARN.
     *
     * @param warehouseArn redshift warehouse ARN
     * @returns Connection info. Value is 'DELETE_CONNECTION' when the connection is deleted but the
     * explorer node is not refreshed yet.
     */
    getRedshiftConnection(warehouseArn: string): redshift.ConnectionParams | undefined | 'DELETE_CONNECTION' {
        const all = this.tryGet<Record<string, redshift.ConnectionParams | 'DELETE_CONNECTION'>>(
            'aws.redshift.connections',
            (v) => {
                if (v !== undefined && typeof v !== 'object') {
                    throw new Error()
                }
                const item = (v as any)?.[warehouseArn]
                // Requested item must be object or 'DELETE_CONNECTION'.
                if (item !== undefined && typeof item !== 'object' && item !== 'DELETE_CONNECTION') {
                    throw new Error()
                }
                return v
            }
        )
        return all?.[warehouseArn]
    }

    /**
     * Sets SSO session creation timestamp for the given session `id`.
     *
     * TODO: this never garbage-collects old connections, so the state will grow forever...
     *
     * @param id Session id
     * @param date Session timestamp
     */
    async setSsoSessionCreationDate(id: string, date: Date) {
        try {
            const all = this.tryGet('#sessionCreationDates', Object, {})
            // TODO: race condition...
            await this.update('#sessionCreationDates', {
                ...all,
                [id]: date.getTime(),
            })
        } catch (err) {
            getLogger().error('auth: failed to set session creation date: %O', err)
        }
    }

    /**
     * Gets SSO session creation timestamp for the given session `id`.
     *
     * @param id Session id
     */
    getSsoSessionCreationDate(id: string): number | undefined {
        const all = this.tryGet<Record<string, number>>('#sessionCreationDates', (v) => {
            if (v !== undefined && typeof v !== 'object') {
                throw new Error()
            }
            const item = (v as any)?.[id]
            // Requested item must be a number.
            if (item !== undefined && typeof item !== 'number') {
                throw new Error()
            }
            return v
        })
        return all?.[id]
    }
}
