// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.auth

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.ActiveConnection
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.ActiveConnectionType
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.BearerTokenFeatureSet
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.checkBearerConnectionValidity
import software.aws.toolkits.jetbrains.services.codemodernizer.isIntellij

fun isCodeTransformAvailable(project: Project): Boolean {
    if (!isIntellij()) return false
    val connection = checkBearerConnectionValidity(project, BearerTokenFeatureSet.Q)
    return connection.connectionType == ActiveConnectionType.IAM_IDC && connection is ActiveConnection.ValidBearer
}
