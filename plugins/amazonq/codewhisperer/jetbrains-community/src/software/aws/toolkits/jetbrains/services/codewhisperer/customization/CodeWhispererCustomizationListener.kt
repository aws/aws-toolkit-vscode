// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.customization

import com.intellij.openapi.application.ApplicationManager
import com.intellij.util.messages.Topic

interface CodeWhispererCustomizationListener {
    fun refreshUi() {}

    companion object {
        @Topic.AppLevel
        val TOPIC = Topic.create("customization listener", CodeWhispererCustomizationListener::class.java)

        fun notifyCustomUiUpdate() {
            ApplicationManager.getApplication().messageBus.syncPublisher(TOPIC).refreshUi()
        }
    }
}
