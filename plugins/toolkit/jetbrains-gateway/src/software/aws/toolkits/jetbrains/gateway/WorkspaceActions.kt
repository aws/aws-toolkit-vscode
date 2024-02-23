// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway

import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.amazon.awssdk.services.codecatalyst.model.DevEnvironmentStatus
import software.amazon.awssdk.services.codecatalyst.model.GetDevEnvironmentResponse
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.resources.message
import kotlin.system.measureTimeMillis

class WorkspaceActions(private val spaceName: String, private val projectName: String, private val envId: String, private val client: CodeCatalystClient) {
    fun getEnvironmentDetails() = client.getDevEnvironment {
        it.spaceName(spaceName)
        it.projectName(projectName)
        it.id(envId)
    }

    fun startEnvironment() {
        client.startDevEnvironment {
            it.spaceName(spaceName)
            it.projectName(projectName)
            it.id(envId)
        }
    }

    fun stopEnvironment() {
        client.stopDevEnvironment {
            it.spaceName(spaceName)
            it.projectName(projectName)
            it.id(envId)
        }
    }

    fun waitForConfigurableState() {
//        when (val status = getEnvironmentDetails().status()) {
//            WorkspaceStatus.PENDING, WorkspaceStatus.STARTING -> {
//                waitForTaskReady()
//                stopEnvironment()
//                waitForTaskStopped()
//            }
//            WorkspaceStatus.RUNNING -> {
//                stopEnvironment()
//                waitForTaskStopped()
//            }
//            WorkspaceStatus.STOPPED -> {
//            }
//            WorkspaceStatus.STOPPING -> {
//                waitForTaskStopped()
//            }
//            WorkspaceStatus.DELETING, WorkspaceStatus.DELETED -> throw IllegalStateException("Environment is deleted, unable to configure")
//            else -> throw IllegalStateException("Unknown state $status")
//        }
    }

    fun waitForTaskReady(indicator: ProgressIndicator) {
        val time = measureTimeMillis {
            val timeout = timeout().iterator()
            var response: GetDevEnvironmentResponse
            do {
                ProgressManager.checkCanceled()
                Thread.sleep(timeout.next())
                response = getEnvironmentDetails()
                indicator.text = message("caws.environment.status", response.status().name)
                LOG.info { "${response.id()} has status ${response.status()}" }
            } while (response.status() == DevEnvironmentStatus.STARTING || response.status() == DevEnvironmentStatus.PENDING)

            if (response.status() != DevEnvironmentStatus.RUNNING) {
                // TODO Localize and validate it gets shown to user correctly
                throw IllegalStateException("Environment did not start: ${response.status()}")
            }
        }

        LOG.info { "waitForTaskReady took ${time}ms" }
    }

    fun waitForTaskStopped(indicator: ProgressIndicator) {
        val time = measureTimeMillis {
            val timeout = timeout().iterator()
            var response: GetDevEnvironmentResponse
            do {
                ProgressManager.checkCanceled()
                Thread.sleep(timeout.next())
                response = getEnvironmentDetails()
                indicator.text = message("caws.environment.status", response.status().name)
            } while (response.status() == DevEnvironmentStatus.STOPPING)

            if (response.status() != DevEnvironmentStatus.STOPPED) {
                // TODO Localize and validate it gets shown to user correctly
                throw IllegalStateException("Environment did not stop: ${response.status()}")
            }
        }

        LOG.info { "waitForTaskStopped took ${time}ms" }
    }

    // returns [5000, 1000, 1000, 1000, ...]
    private fun timeout() = generateSequence<Long>(5000) { 1000 }

    companion object {
        private val LOG = getLogger<WorkspaceActions>()
    }
}
