// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.pinning

import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES_UNAVAILABLE_BUILDER_ID
import software.aws.toolkits.jetbrains.core.credentials.sono.isSono

class QConnection : FeatureWithPinnedConnection {
    override val featureId = "aws.q"
    override val featureName = "Amazon Q"

    override fun supportsConnectionType(connection: ToolkitConnection): Boolean {
        if (connection is AwsBearerTokenConnection) {
            if (connection.isSono()) {
                return (Q_SCOPES - Q_SCOPES_UNAVAILABLE_BUILDER_ID).all { it in connection.scopes }
            }
            return Q_SCOPES.all { it in connection.scopes }
        }

        return false
    }

    companion object {
        fun getInstance() = FeatureWithPinnedConnection.EP_NAME.findExtensionOrFail(QConnection::class.java)
    }
}
