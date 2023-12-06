// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import software.aws.toolkits.telemetry.CodeTransformPreValidationError

data class InvalidTelemetryReason(val category: CodeTransformPreValidationError? = CodeTransformPreValidationError.Unknown, val additonalInfo: String = "")
