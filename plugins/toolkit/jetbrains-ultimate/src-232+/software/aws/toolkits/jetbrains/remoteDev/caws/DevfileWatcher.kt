// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.remoteDev.caws

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import com.intellij.psi.PsiManager
import com.intellij.psi.PsiTreeChangeAdapter
import com.intellij.psi.PsiTreeChangeEvent

class DevfileWatcher : StartupActivity.DumbAware {

    private var fileChanged = false

    override fun runActivity(project: Project) {
        PsiManager.getInstance(project).addPsiTreeChangeListener(
            object : PsiTreeChangeAdapter() {
                private fun onEvent(event: PsiTreeChangeEvent) {
                    val file = event.file?.virtualFile ?: return
                    if (file.name != DEVFILE_PATTERN) return
                    getInstance().updatedDevfile(hasFileChanged = true)
                }

                override fun childAdded(event: PsiTreeChangeEvent) {
                    onEvent(event)
                }

                override fun childRemoved(event: PsiTreeChangeEvent) {
                    onEvent(event)
                }

                override fun childrenChanged(event: PsiTreeChangeEvent) {
                    onEvent(event)
                }
            },
            project
        )
    }

    // TODO: return false if file is reverted to original state
    fun hasDevfileChanged(): Boolean = fileChanged

    fun updatedDevfile(hasFileChanged: Boolean) {
        fileChanged = hasFileChanged
    }

    companion object {
        fun getInstance() = service<DevfileWatcher>()
        const val DEVFILE_PATTERN = "devfile.yaml"
    }
}
