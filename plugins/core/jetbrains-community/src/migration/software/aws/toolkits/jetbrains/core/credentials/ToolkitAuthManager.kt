// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package migration.software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.components.service
import software.aws.toolkits.jetbrains.core.credentials.AuthProfile
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.LastLoginIdcInfo
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.UserConfigSsoSessionProfile

interface ToolkitAuthManager {
    fun listConnections(): List<ToolkitConnection>

    fun createConnection(profile: AuthProfile): ToolkitConnection

    /**
     * Creates a connection that is not visible to the rest of the toolkit unless authentication succeeds
     * @return [AwsBearerTokenConnection] on success
     */
    fun tryCreateTransientSsoConnection(profile: AuthProfile, callback: (AwsBearerTokenConnection) -> Unit): AwsBearerTokenConnection
    fun getOrCreateSsoConnection(profile: UserConfigSsoSessionProfile): AwsBearerTokenConnection

    fun deleteConnection(connection: ToolkitConnection)
    fun deleteConnection(connectionId: String)

    fun getConnection(connectionId: String): ToolkitConnection?

    /*
     * The info user used last time to log in to IdC for prefilling the form.
     */
    fun getLastLoginIdcInfo(): LastLoginIdcInfo

    companion object {
        fun getInstance() = service<ToolkitAuthManager>()
    }
}
