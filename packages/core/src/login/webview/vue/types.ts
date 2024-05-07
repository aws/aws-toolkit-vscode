/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthAddConnection } from '../../../shared/telemetry/telemetry'

/**
 * Types that can be used by both the backend and frontend files
 */

/**
 * The identifiers for the different features that use Auth.
 *
 * These are important as they represent the specific feature for all parts of the
 * auth sign setup flows.
 */
export const FeatureIds = {
    TOOLKIT: 'TOOLKIT',
    AMAZONQ: 'AMAZONQ',
} as const
export type FeatureId = (typeof FeatureIds)[keyof typeof FeatureIds]

/**
 * The type of Auth flows that the user could see.
 */
export const AuthFlowStates = {
    /** User needs to select/setup a connection */
    LOGIN: 'LOGIN',
    /**  User has a connection but just needs to reauthenticate it */
    REAUTHNEEDED: 'REAUTHNEEDED',
    /**  Reauthentication is currently in progress */
    REAUTHENTICATING: 'REAUTHENTICATING',
} as const
export type AuthFlowState = (typeof AuthFlowStates)[keyof typeof AuthFlowStates]

export enum LoginOption {
    NONE,
    BUILDER_ID,
    ENTERPRISE_SSO,
    IAM_CREDENTIAL,
    EXISTING_LOGINS,
}

/**
 * 'elementId' for auth telemetry
 */
export type AuthUiClick =
    | 'auth_backButton'
    | 'auth_cancelButton'
    | 'auth_continueButton'
    | 'auth_idcOption'
    | 'auth_builderIdOption'
    | 'auth_credentialsOption'
    | 'auth_codecatalystOption'
    | 'auth_existingAuthOption'
    | 'auth_regionSelection'
    | 'auth_codeCatalystSignIn'
    | 'auth_toolkitCloseButton'
    | 'auth_reauthenticate'
    | 'auth_signout'
    | 'auth_helpLink'
    | 'amazonq_switchToQSignIn'

export const userCancelled = 'userCancelled'

export type AuthEnabledFeatures = 'awsExplorer' | 'codewhisperer' | 'codecatalyst'

type Writeable<T> = { -readonly [U in keyof T]: T[U] }
export type TelemetryMetadata = Partial<Writeable<AuthAddConnection>>
export type AuthError = { id: string; text: string }
