// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.resources

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import kotlinx.coroutines.runBlocking
import software.aws.toolkits.jetbrains.services.ecs.exec.SessionManagerPluginWarning
import software.aws.toolkits.jetbrains.utils.getCoroutineBgContext

object SessionManagerPluginInstallationVerification {
    private fun checkInstallation(): Boolean = runBlocking(getCoroutineBgContext()) {
        try {
            val process = CapturingProcessHandler(GeneralCommandLine("session-manager-plugin")).runProcess()
            process.exitCode == 0
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
