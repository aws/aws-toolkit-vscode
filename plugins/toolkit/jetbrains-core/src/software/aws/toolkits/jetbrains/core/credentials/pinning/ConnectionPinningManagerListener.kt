// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.pinning

import com.intellij.util.messages.Topic
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import java.util.EventListener

interface ConnectionPinningManagerListener : EventListener {
    fun pinnedConnectionChanged(feature: FeatureWithPinnedConnection, newConnection: ToolkitConnection?)

    companion object {
        @Topic.AppLevel
        val TOPIC = Topic.create("Feature pinned active connection change", ConnectionPinningManagerListener::class.java)
    }
}
