// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.util.messages.Topic
import software.aws.toolkits.jetbrains.gateway.WorkspaceIdentifier

object WorkspaceNotifications {
    val TOPIC = Topic.create("Dev Environment list state change", WorkspaceListStateChangeListener::class.java)
}

data class WorkspaceListStateChangeContext(
    val wsId: WorkspaceIdentifier
)

interface WorkspaceListStateChangeListener {
    fun environmentStarted(context: WorkspaceListStateChangeContext)
}
