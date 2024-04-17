// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.auth

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.ActiveConnection
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.ActiveConnectionType
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.BearerTokenFeatureSet
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.checkBearerConnectionValidity

fun isFeatureDevAvailable(project: Project): Boolean {
    val connection = checkBearerConnectionValidity(project, BearerTokenFeatureSet.Q)
    return (connection.connectionType == ActiveConnectionType.IAM_IDC || connection.connectionType == ActiveConnectionType.BUILDER_ID) &&
        connection is ActiveConnection.ValidBearer
}
