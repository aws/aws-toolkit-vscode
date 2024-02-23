// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import software.aws.toolkits.core.credentials.CredentialType
import software.aws.toolkits.telemetry.CredentialType as TelemetryCredentialType

fun CredentialType?.toTelemetryType(): TelemetryCredentialType = when (this) {
    CredentialType.StaticProfile -> TelemetryCredentialType.StaticProfile
    CredentialType.StaticSessionProfile -> TelemetryCredentialType.StaticSessionProfile
    CredentialType.CredentialProcessProfile -> TelemetryCredentialType.CredentialProcessProfile
    CredentialType.AssumeRoleProfile -> TelemetryCredentialType.AssumeRoleProfile
    CredentialType.AssumeMfaRoleProfile -> TelemetryCredentialType.AssumeMfaRoleProfile
    CredentialType.SsoProfile -> TelemetryCredentialType.SsoProfile
    CredentialType.Ec2Metadata -> TelemetryCredentialType.Ec2Metadata
    CredentialType.EcsMetadata -> TelemetryCredentialType.EcsMetatdata
    null -> TelemetryCredentialType.Other
}
