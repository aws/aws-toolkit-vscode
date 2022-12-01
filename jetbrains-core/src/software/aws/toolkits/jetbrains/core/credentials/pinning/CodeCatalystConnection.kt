// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.pinning

import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL

class CodeCatalystConnection : FeatureWithPinnedConnection {
    override val featureId: String = "aws.codecatalyst"
    override val featureName: String = "CodeCatalyst"
    override fun supportsConnectionType(connection: ToolkitConnection): Boolean {
        if (connection is AwsBearerTokenConnection) {
            if (connection is ManagedBearerSsoConnection && connection.startUrl != SONO_URL) {
                // doesn't support arbitrary SSO
                return false
            }

            return true
        }

        // only supports bearer connections
        return false
    }

    companion object {
        fun getInstance() = FeatureWithPinnedConnection.EP_NAME.findExtensionOrFail(CodeCatalystConnection::class.java)
    }
}
