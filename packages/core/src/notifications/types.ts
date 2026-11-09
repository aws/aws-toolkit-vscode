/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { EnvType, OperatingSystem } from '../shared/telemetry/util'
import { TypeConstructor } from '../shared/utilities/typeConstructors'
import { AuthUserState, AuthStatus } from '../shared/telemetry/telemetry.gen'
import { AuthType } from '../auth/connection'

/** Types of information that we can use to determine whether to show a notification or not. */

type OsCriteria = {
    type: 'OS'
    values: OperatingSystem[]
}

type ComputeEnvCriteria = {
    type: 'ComputeEnv'
    values: EnvType[]
}

type AuthTypeCriteria = {
    type: 'AuthType'
    values: AuthType[]
}

type AuthRegionCriteria = {
    type: 'AuthRegion'
    values: string[]
}

type AuthStateCriteria = {
    type: 'AuthState'
    values: AuthStatus[]
}

type AuthScopesCriteria = {
    type: 'AuthScopes'
    values: string[] // TODO: Scopes should be typed. Could import here, but don't want to import too much.
}

type ActiveExtensionsCriteria = {
    type: 'ActiveExtensions'
    values: string[]
}

/** Generic condition where the type determines how the values are evaluated. */
export type CriteriaCondition =
    | OsCriteria
    | ComputeEnvCriteria
    | AuthTypeCriteria
    | AuthRegionCriteria
    | AuthStateCriteria
    | AuthScopesCriteria
    | ActiveExtensionsCriteria

/** One of the subconditions (clauses) must match to be valid. */
export interface OR {
    readonly type: 'or'
    readonly clauses: (Range | ExactMatch)[]
}

/** Version must be within the bounds to be valid. Missing bound indicates that bound is open-ended. */
export interface Range {
    readonly type: 'range'
    readonly lowerInclusive?: string // null means "-inf"
    readonly upperExclusive?: string // null means "+inf"
}

/** Version must be equal. */
export interface ExactMatch {
    readonly type: 'exactMatch'
    readonly values: string[]
}

export type ConditionalClause = Range | ExactMatch | OR

export type OnReceiveType = 'toast' | 'modal'
export type OnClickType = { type: 'modal' } | { type: 'openTextDocument' } | { type: 'openUrl'; url: string }
export type ActionType = 'openUrl' | 'updateAndReload' | 'openTextDocument'

/** How to display the notification. */
export interface UIRenderInstructions {
    content: {
        [`en-US`]: {
            title: string
            description: string
            toastPreview?: string // optional property for toast
        }
    }
    onReceive: OnReceiveType
    onClick: OnClickType
    actions?: Array<{
        type: ActionType
        displayText: {
            [`en-US`]: string
        }
        url?: string // optional property for 'openUrl'
    }>
}

/** Condition/criteria section of a notification. */
export interface DisplayIf {
    extensionId: string
    ideVersion?: ConditionalClause
    extensionVersion?: ConditionalClause
    additionalCriteria?: CriteriaCondition[]
}

export interface ToolkitNotification {
    id: string
    displayIf: DisplayIf
    uiRenderInstructions: UIRenderInstructions
}

export interface Notifications {
    schemaVersion: string
    notifications: ToolkitNotification[]
}

export type NotificationData = {
    payload?: Notifications
    eTag?: string
}

export type NotificationsState = {
    // Categories
    startUp: NotificationData
    emergency: NotificationData

    // Util
    dismissed: string[]
    newlyReceived: string[]
}

export const defaultNotificationsState: () => NotificationsState = () => {
    return {
        startUp: {},
        emergency: {},
        dismissed: [],
        newlyReceived: [],
    }
}

export const NotificationsStateConstructor: TypeConstructor<NotificationsState> = (v: unknown): NotificationsState => {
    const isNotificationsState = (v: Partial<NotificationsState>): v is NotificationsState => {
        const requiredKeys: (keyof NotificationsState)[] = ['startUp', 'emergency', 'dismissed', 'newlyReceived']
        return (
            requiredKeys.every((key) => key in v) &&
            Array.isArray(v.dismissed) &&
            Array.isArray(v.newlyReceived) &&
            typeof v.startUp === 'object' &&
            typeof v.emergency === 'object'
        )
    }

    if (v && typeof v === 'object' && isNotificationsState(v)) {
        return v
    }
    throw new Error('Cannot cast to NotificationsState.')
}

export type NotificationType = keyof Omit<NotificationsState, 'dismissed' | 'newlyReceived'>

export interface RuleContext {
    readonly ideVersion: typeof vscode.version
    readonly extensionVersion: string
    readonly os: OperatingSystem
    readonly computeEnv: EnvType
    readonly authTypes: AuthType[]
    readonly authRegions: string[]
    readonly authStates: AuthStatus[]
    readonly authScopes: string[]
    readonly activeExtensions: string[]
}

/** Type expected by things that build (or help build) {@link RuleContext} */
export type AuthState = Omit<AuthUserState, 'source'>

export function getNotificationTelemetryId(n: ToolkitNotification): string {
    return `TARGETED_NOTIFICATION:${n.id}`
}

export type DevNotificationsState = { startUp: ToolkitNotification[]; emergency: ToolkitNotification[] }
