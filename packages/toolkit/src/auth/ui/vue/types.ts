/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CredentialSourceId, FeatureId } from '../../../shared/telemetry/telemetry.gen'
import { AuthFormId } from './authForms/types'
import { AuthAddConnection } from '../../../shared/telemetry/telemetry.gen'

export type AuthError = { id: string; text: string }
export type ServiceItemId = 'awsExplorer' | 'codewhisperer' | 'codecatalyst'
export const userCancelled = 'userCancelled'
export const emptyFields = 'emptyFields'
export const fieldHasError = 'fieldHasError'

export function isServiceItemId(value: unknown): value is ServiceItemId {
    return (
        typeof value === 'string' && (value === 'awsExplorer' || value === 'codewhisperer' || value === 'codecatalyst')
    )
}

/** Maps an {@link AuthFormId} to the related components necessary for the telemetry metric {@link AuthAddConnection} */
export const authFormTelemetryMapping: {
    [id in AuthFormId]: { featureType: FeatureId; authType: CredentialSourceId }
} = {
    builderIdCodeCatalyst: { featureType: 'codecatalyst', authType: 'awsId' },
    builderIdCodeWhisperer: { featureType: 'codewhisperer', authType: 'awsId' },
    credentials: { featureType: 'awsExplorer', authType: 'sharedCredentials' },
    identityCenterCodeWhisperer: { featureType: 'codewhisperer', authType: 'iamIdentityCenter' },
    identityCenterCodeCatalyst: { featureType: 'codecatalyst', authType: 'iamIdentityCenter' },
    identityCenterExplorer: { featureType: 'awsExplorer', authType: 'iamIdentityCenter' },
    aggregateExplorer: { featureType: 'awsExplorer', authType: 'other' }, // this should never actually be used
}
