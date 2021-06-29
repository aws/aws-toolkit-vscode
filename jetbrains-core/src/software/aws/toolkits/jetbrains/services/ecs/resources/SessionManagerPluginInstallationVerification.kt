// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.resources

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.vcs.log.runInEdt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import software.aws.toolkits.jetbrains.services.ecs.exec.SessionManagerPluginWarning

object SessionManagerPluginInstallationVerification {
    private fun checkInstallation(): Boolean = runBlocking(Dispatchers.IO) {
        try {
            val process = CapturingProcessHandler(GeneralCommandLine("session-manager-plugin")).runProcess()
            if (process.exitCode != 0) {
                false
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    fun requiresSessionManager(project: Project, block: () -> Unit) {
        if (checkInstallation()) {
            block()
        } else {
            runInEdt {
                SessionManagerPluginWarning(project).show()
            }
        }
    }
}
