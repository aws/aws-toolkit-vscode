// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.util.messages.Topic
import java.util.EventListener

interface LambdaSettingsChangeListener : EventListener {
    companion object {
        @JvmStatic val TOPIC = Topic("SAM Setting has been changed", LambdaSettingsChangeListener::class.java)
    }

    /**
     * SAM CLI version evaluation finished for the chosen profile, and it may be validated synchronously now.
     */
    fun samShowAllHandlerGutterIconsSettingsChange(isShow: Boolean)
}
