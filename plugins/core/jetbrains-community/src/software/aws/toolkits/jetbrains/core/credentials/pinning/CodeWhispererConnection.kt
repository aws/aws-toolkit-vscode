// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.pinning

import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.CODEWHISPERER_SCOPES

@Deprecated("pending removal, merge into QConnection & QSCOPES")
class CodeWhispererConnection : FeatureWithPinnedConnection {
    override val featureId = "aws.codewhisperer"
    override val featureName = "CodeWhisperer"

    override fun supportsConnectionType(connection: ToolkitConnection): Boolean {
        if (connection is AwsBearerTokenConnection) {
            return CODEWHISPERER_SCOPES.all { it in connection.scopes }
        }

        return false
    }

    companion object {
        fun getInstance() = FeatureWithPinnedConnection.EP_NAME.findExtensionOrFail(CodeWhispererConnection::class.java)
    }
}
