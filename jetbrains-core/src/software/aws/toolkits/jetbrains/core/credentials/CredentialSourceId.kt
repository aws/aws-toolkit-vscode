// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import software.aws.toolkits.core.credentials.CredentialSourceId
import software.aws.toolkits.telemetry.CredentialSourceId as TelemetryCredentialSourceId

fun CredentialSourceId?.toTelemetryCredentialSourceId(): TelemetryCredentialSourceId = when (this) {
    CredentialSourceId.SharedCredentials -> TelemetryCredentialSourceId.SharedCredentials
    CredentialSourceId.SdkStore -> TelemetryCredentialSourceId.SdkStore
    CredentialSourceId.Ec2 -> TelemetryCredentialSourceId.Ec2
    CredentialSourceId.Ecs -> TelemetryCredentialSourceId.Ecs
    CredentialSourceId.EnvVars -> TelemetryCredentialSourceId.EnvVars
    else -> TelemetryCredentialSourceId.Other
}
