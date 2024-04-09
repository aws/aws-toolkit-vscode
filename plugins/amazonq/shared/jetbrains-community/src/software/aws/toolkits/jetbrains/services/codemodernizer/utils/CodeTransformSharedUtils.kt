// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.utils

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.ActiveConnection
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.ActiveConnectionType
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.BearerTokenFeatureSet
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.checkBearerConnectionValidity
import java.time.Instant

fun calculateTotalLatency(startTime: Instant, endTime: Instant) = (endTime.toEpochMilli() - startTime.toEpochMilli()).toInt()

fun isIntellij(): Boolean {
    val productCode = ApplicationInfo.getInstance().build.productCode
    return productCode == "IC" || productCode == "IU"
}

fun isCodeTransformAvailable(project: Project): Boolean {
    if (!isIntellij()) return false
    val connection = checkBearerConnectionValidity(project, BearerTokenFeatureSet.Q)
    return connection.connectionType == ActiveConnectionType.IAM_IDC && connection is ActiveConnection.ValidBearer
}
