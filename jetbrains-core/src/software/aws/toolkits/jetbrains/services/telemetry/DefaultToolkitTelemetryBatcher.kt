// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import software.aws.toolkits.core.telemetry.DefaultTelemetryBatcher

class DefaultToolkitTelemetryBatcher : DefaultTelemetryBatcher(DefaultTelemetryPublisher())