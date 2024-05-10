// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

sealed interface MavenDependencyReportCommandsResult {
    object Success : MavenDependencyReportCommandsResult
    object Failure : MavenDependencyReportCommandsResult
    object Cancelled : MavenDependencyReportCommandsResult
}
