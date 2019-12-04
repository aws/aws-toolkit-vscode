// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.components.telemetry

import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService

interface TelemetryComponent

// The only purpose of this class is to force the creation of ClientTelemetryService on IDE startup.
class DefaultTelemetryComponent(val service: TelemetryService) : TelemetryComponent
