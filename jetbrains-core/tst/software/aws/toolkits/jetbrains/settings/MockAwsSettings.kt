// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import java.util.UUID

class MockAwsSettings(
    override var isTelemetryEnabled: Boolean,
    override var promptedForTelemetry: Boolean,
    override val clientId: UUID
) : AwsSettings
