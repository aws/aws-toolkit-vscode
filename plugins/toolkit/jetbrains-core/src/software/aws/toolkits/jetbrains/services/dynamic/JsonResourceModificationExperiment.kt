// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.EditorNotifications
import software.aws.toolkits.jetbrains.core.experiments.ToolkitExperiment
import software.aws.toolkits.jetbrains.core.experiments.ToolkitExperimentStateChangedListener
import software.aws.toolkits.jetbrains.core.experiments.suggest
import software.aws.toolkits.resources.message

object JsonResourceModificationExperiment : ToolkitExperiment(
    "jsonResourceModification",
    { message("dynamic_resources.experiment.title") },
    { message("dynamic_resources.experiment.description") }
)

class SuggestEditExperimentListener : FileEditorManagerListener {
    override fun fileOpened(source: FileEditorManager, file: VirtualFile) {
        if (file is DynamicResourceVirtualFile) {
            JsonResourceModificationExperiment.suggest()
        }
    }
}

class UpdateOnExperimentState(private val project: Project) : ToolkitExperimentStateChangedListener {
    override fun enableSettingsStateChanged(toolkitExperiment: ToolkitExperiment) {
        if (toolkitExperiment is JsonResourceModificationExperiment) {
            with(EditorNotifications.getInstance(project)) {
                FileEditorManager.getInstance(project).openFiles.filterIsInstance<DynamicResourceVirtualFile>().forEach { updateNotifications(it) }
            }
        }
    }
}
