// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package migration.software.aws.toolkits.jetbrains.core.credentials.pinning

import com.intellij.openapi.components.service
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.FeatureWithPinnedConnection

interface ConnectionPinningManager {
    fun isFeaturePinned(feature: FeatureWithPinnedConnection): Boolean
    fun getPinnedConnection(feature: FeatureWithPinnedConnection): ToolkitConnection?
    fun setPinnedConnection(feature: FeatureWithPinnedConnection, newConnection: ToolkitConnection?)

    fun pinFeatures(oldConnection: ToolkitConnection?, newConnection: ToolkitConnection, features: List<FeatureWithPinnedConnection>)

    companion object {
        fun getInstance(): ConnectionPinningManager = service()
    }
}
