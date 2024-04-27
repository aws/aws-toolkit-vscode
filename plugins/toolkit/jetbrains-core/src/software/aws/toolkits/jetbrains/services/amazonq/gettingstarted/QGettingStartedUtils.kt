// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.gettingstarted

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.settings.MeetQSettings
import software.aws.toolkits.telemetry.UiTelemetry

fun openMeetQPage(project: Project): Boolean {
    val meetQSettings = MeetQSettings.getInstance()
    if (!meetQSettings.shouldDisplayPage) {
        return false
    } else {
        runInEdt {
            FileEditorManager.getInstance(
                project
            ).openTextEditor(
                OpenFileDescriptor(
                    project,
                    QGettingStartedVirtualFile()
                ),
                true
            )
            meetQSettings.shouldDisplayPage = false
            UiTelemetry.click(project, "toolkit_openedWelcomeToAmazonQPage")
        }
    }
    return true
}
