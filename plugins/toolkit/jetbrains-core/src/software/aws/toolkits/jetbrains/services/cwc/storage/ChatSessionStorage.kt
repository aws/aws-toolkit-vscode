// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.storage

import com.intellij.openapi.project.Project
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.ChatSessionFactory
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.v1.ChatSessionFactoryV1

class ChatSessionStorage(
    private val chatSessionFactory: ChatSessionFactory = ChatSessionFactoryV1(),
) {
    private val sessions = mutableMapOf<String, ChatSessionInfo>()

    fun getSession(tabId: String) = sessions[tabId]

    fun getSession(tabId: String, project: Project) = sessions.getOrPut(tabId) {
        val session = chatSessionFactory.create(project)
        val scope = CoroutineScope(SupervisorJob())
        ChatSessionInfo(session = session, scope = scope, history = mutableListOf())
    }

    fun deleteSession(tabId: String) {
        sessions.remove(tabId)?.scope?.cancel()
    }
}
