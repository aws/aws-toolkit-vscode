// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.project.Project
import software.aws.toolkits.core.ConnectionSettings

class AwsConnectionManagerConnection(private val project: Project) : AwsCredentialConnection {
    override val id: String = "AwsConnectionManagerConnection"
    override val label: String
        get() = AwsConnectionManager.getInstance(project).connectionState.displayMessage

    override fun getConnectionSettings(): ConnectionSettings = error("Use AwsConnectionManager for connection")
}
