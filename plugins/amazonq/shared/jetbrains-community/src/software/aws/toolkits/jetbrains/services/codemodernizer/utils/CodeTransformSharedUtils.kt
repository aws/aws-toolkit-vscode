// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.utils

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.lazyIsUnauthedBearerConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import software.aws.toolkits.jetbrains.services.amazonq.isQSupportedInThisVersion
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend
import java.time.Instant

fun calculateTotalLatency(startTime: Instant, endTime: Instant) = (endTime.toEpochMilli() - startTime.toEpochMilli()).toInt()

fun isIntellij(): Boolean {
    val productCode = ApplicationInfo.getInstance().build.productCode
    return productCode == "IC" || productCode == "IU"
}

fun isValidCodeTransformConnection(project: Project): Boolean {
    val activeConnection =
        ToolkitConnectionManager.getInstance(project)
            .activeConnectionForFeature(QConnection.getInstance()) as? AwsBearerTokenConnection ?: return false
    return !activeConnection.lazyIsUnauthedBearerConnection()
}
fun isCodeTransformAvailable(project: Project): Boolean {
    if (!isIntellij()) return false
    if (isRunningOnRemoteBackend() || !isQSupportedInThisVersion()) return false
    return isValidCodeTransformConnection(project)
}
