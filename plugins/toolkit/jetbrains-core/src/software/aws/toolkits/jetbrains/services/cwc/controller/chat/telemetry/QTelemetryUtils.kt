// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.controller.chat.telemetry

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection

fun getStartUrl(project: Project): String? {
    val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(QConnection.getInstance()) as? AwsBearerTokenConnection?
    return connection?.startUrl
}
