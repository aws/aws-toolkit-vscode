// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso.bearer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.util.messages.Topic
import java.util.EventListener

interface BearerTokenProviderListener : EventListener {
    fun onChange(providerId: String) {}
    fun invalidate(providerId: String) {}

    companion object {
        @Topic.AppLevel
        val TOPIC = Topic.create("AWS SSO bearer token provider status change", BearerTokenProviderListener::class.java)

        fun notifyCredUpdate(providerId: String) {
            ApplicationManager.getApplication().messageBus.syncPublisher(BearerTokenProviderListener.TOPIC).onChange(providerId)
        }
    }
}
