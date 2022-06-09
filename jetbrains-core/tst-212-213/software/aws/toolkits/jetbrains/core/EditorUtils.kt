// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.impl.NonBlockingReadActionImpl
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.util.Key
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.ui.EditorNotificationPanel
import com.intellij.ui.EditorNotifications

@Suppress("UNUSED_PARAMETER")
fun <T : EditorNotifications.Provider<*>, U : EditorNotificationPanel> getEditorNotifications(editor: FileEditor, provider: Class<T>, key: Key<U>): U? {
    PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
    NonBlockingReadActionImpl.waitForAsyncTaskCompletion()
    return editor.getUserData(key)
}
