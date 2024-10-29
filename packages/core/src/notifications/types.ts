/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { EnvType, OperatingSystem } from '../shared/telemetry/util'
import { TypeConstructor } from '../shared/utilities/typeConstructors'

/** Types of information that we can use to determine whether to show a notification or not. */
export type Criteria =
    | 'OS'
    | 'ComputeEnv'
    | 'AuthType'
    | 'AuthRegion'
    | 'AuthState'
    | 'AuthScopes'
    | 'InstalledExtensions'
    | 'ActiveExtensions'

/** Generic condition where the type determines how the values are evaluated. */
export interface CriteriaCondition {
    readonly type: Criteria
    readonly values: string[]
}

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

/** How to display the notification. */
export interface UIRenderInstructions {
    content: {
        [`en-US`]: {
            title: string
            description: string
            descriptionPreview?: string // optional property for toast
        }
    }
    onRecieve: string
    onClick: {
        type: string
        url?: string // optional property for 'openUrl'
    }
    actions?: Array<{
        type: string
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
}

export const NotificationsStateConstructor: TypeConstructor<NotificationsState> = (v: unknown): NotificationsState => {
    const isNotificationsState = (v: Partial<NotificationsState>): v is NotificationsState => {
        const requiredKeys: (keyof NotificationsState)[] = ['startUp', 'emergency', 'dismissed']
        return (
            requiredKeys.every((key) => key in v) &&
            Array.isArray(v.dismissed) &&
            typeof v.startUp === 'object' &&
            typeof v.emergency === 'object'
        )
    }

    if (v && typeof v === 'object' && isNotificationsState(v)) {
        return v
    }
    throw new Error('Cannot cast to NotificationsState.')
}

export type NotificationType = keyof Omit<NotificationsState, 'dismissed'>

export interface RuleContext {
    readonly ideVersion: typeof vscode.version
    readonly extensionVersion: string
    readonly os: OperatingSystem
    readonly computeEnv: EnvType
    readonly authTypes: string[]
    readonly authRegions: string[]
    readonly authStates: string[]
    readonly authScopes: string[]
    readonly installedExtensions: string[]
    readonly activeExtensions: string[]
}
