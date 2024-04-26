// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.project.Project
import org.slf4j.LoggerFactory
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeCatalystConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.IDENTITY_CENTER_ROLE_ACCESS_SCOPE

private val LOG = LoggerFactory.getLogger("ToolkitUtils")

fun isTookitConnected(project: Project): Boolean =
    ToolkitConnectionManager.getInstance(project).let {
        if (CredentialManager.getInstance().getCredentialIdentifiers().isNotEmpty()) {
            LOG.debug { "inspecting existing connection and found IAM credentials" }
            return@let true
        }

        val conn = it.activeConnection()
        val hasIdCRoleAccess = if (conn is AwsBearerTokenConnection) {
            conn.scopes.contains(IDENTITY_CENTER_ROLE_ACCESS_SCOPE)
        } else {
            false
        }

        if (hasIdCRoleAccess) {
            LOG.debug { "inspecting existing connection and found bearer connections with IdCRoleAccess scope" }
            return@let true
        }

        val isCodecatalystConn = it.activeConnectionForFeature(CodeCatalystConnection.getInstance()) != null
        if (isCodecatalystConn) {
            LOG.debug { "inspecting existing connection and found active Codecatalyst connection" }
            return@let true
        }

        return@let false
    }
