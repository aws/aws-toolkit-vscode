// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.session

class ChatSessionStorage {
    private val sessions = mutableMapOf<String, Session>()

    private fun createSession(tabId: String): Session {
        val session = Session(tabId)
        sessions[tabId] = session
        return session
    }

    @Synchronized fun getSession(tabId: String): Session = sessions[tabId] ?: createSession(tabId)

    fun deleteSession(tabId: String) {
        sessions.remove(tabId)
    }

    // Find all sessions that are currently waiting to be authenticated
    fun getAuthenticatingSessions(): List<Session> = this.sessions.values.filter { it.isAuthenticating }

    fun changeAuthenticationNeeded(isAuthenticating: Boolean) {
        sessions.keys.forEach { sessions[it]?.isAuthenticating = isAuthenticating }
    }

    fun changeAuthenticationNeededNotified(authNeededNotified: Boolean) {
        sessions.keys.forEach { sessions[it]?.authNeededNotified = authNeededNotified }
    }
}
