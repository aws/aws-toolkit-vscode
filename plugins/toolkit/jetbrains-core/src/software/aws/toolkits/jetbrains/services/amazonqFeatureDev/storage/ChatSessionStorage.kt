// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.storage

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.Session

class ChatSessionStorage {
    private val sessions = mutableMapOf<String, Session>()

    private fun createSession(tabId: String, project: Project): Session {
        val session = Session(tabId, project)
        sessions[tabId] = session
        return session
    }

    @Synchronized fun getSession(tabId: String, project: Project): Session = sessions[tabId] ?: createSession(tabId, project)

    fun deleteSession(tabId: String) {
        sessions.remove(tabId)
    }

    // Find all sessions that are currently waiting to be authenticated
    fun getAuthenticatingSessions(): List<Session> = this.sessions.values.filter { it.isAuthenticating }
}
