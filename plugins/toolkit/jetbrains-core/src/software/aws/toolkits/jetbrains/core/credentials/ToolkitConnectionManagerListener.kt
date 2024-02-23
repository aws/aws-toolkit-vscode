// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.util.messages.Topic
import java.util.EventListener

// TODO: unify with [ConnectionSettingsStateChangeNotifier]
interface ToolkitConnectionManagerListener : EventListener {
    fun activeConnectionChanged(newConnection: ToolkitConnection?)

    companion object {
        @Topic.AppLevel
        val TOPIC = Topic.create("ToolkitConnectionManagerListener active connection change", ToolkitConnectionManagerListener::class.java)
    }
}
