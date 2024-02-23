// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.impl.NonBlockingReadActionImpl
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.ui.EditorNotificationPanel
import com.intellij.ui.EditorNotificationProvider
import com.intellij.ui.EditorNotifications
import com.intellij.ui.EditorNotificationsImpl
import javax.swing.JComponent

@Suppress("UNUSED_PARAMETER")
fun <T : EditorNotificationProvider, U : EditorNotificationPanel> getEditorNotifications(
    project: Project,
    editor: FileEditor,
    provider: Class<T>,
    key: Key<U>
): JComponent? {
    PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
    NonBlockingReadActionImpl.waitForAsyncTaskCompletion()

    val editorNotifications = EditorNotifications.getInstance(project) as EditorNotificationsImpl
    editorNotifications.completeAsyncTasks()

    @Suppress("USELESS_CAST")
    return editorNotifications.getNotificationPanels(editor)[provider as Class<*>]
}
