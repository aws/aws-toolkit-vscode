// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.resources

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.execution.process.CapturingProcessRunner
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessHandlerFactory
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.ExecutableBackedCacheResource
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.credentials.toEnvironmentVariables
import software.aws.toolkits.jetbrains.core.executables.CloudDebugExecutable
import software.aws.toolkits.jetbrains.services.clouddebug.execution.MessageEmitter
import software.aws.toolkits.jetbrains.services.clouddebug.execution.steps.CloudDebugCliValidate
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils
import java.util.concurrent.TimeUnit

object CloudDebuggingResources {
    private val OBJECT_MAPPER = jacksonObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
    val LIST_INSTRUMENTED_RESOURCES: Resource<Set<ListResultEntry>> =
        ExecutableBackedCacheResource(CloudDebugExecutable::class, "cdb.list_resources") {
            val results = mutableSetOf<ListResultEntry>()

            this.withParameters("list")

            var nextToken: String? = null
            do {
                nextToken = callListInstrumentedResources(this, results, nextToken)
            } while (!nextToken.isNullOrEmpty())

            results
        }

    /*
     * Describes instrumented resources using cluster name/arn and service name/arn. Input can be original or instrumented service
     */
    fun describeInstrumentedResource(project: Project, clusterName: String, serviceName: String): DescribeResult? {
        val execTask = try {
            CloudDebugCliValidate.validateAndLoadCloudDebugExecutable()
        } catch (e: Exception) {
            LOG.warn(e) { "Failed to validate cloud debug executable while attempting to do a describe call" }
            return null
        }

        val accountSettings = ProjectAccountSettingsManager.getInstance(project)
        val credentials = accountSettings.activeCredentialProvider.resolveCredentials().toEnvironmentVariables()
        val region = accountSettings.activeRegion.toEnvironmentVariables()

        val generalCommandLine = execTask.getCommandLine()
            .withParameters("describe")
            .withParameters("--cluster")
            .withParameters(EcsUtils.serviceArnToName(clusterName))
            .withParameters("--service")
            .withParameters(EcsUtils.originalServiceName(serviceName))
            .withEnvironment(credentials)
            .withEnvironment(region)

        return try {
            val processOutput = CapturingProcessRunner(
                ProcessHandlerFactory.getInstance().createProcessHandler(generalCommandLine)
            ).runProcess(TimeUnit.SECONDS.toMillis(5).toInt()) // TODO: Is this a good timeout? It will make AWS calls...

            check(!processOutput.isTimeout) { "Timed out" }
            check(processOutput.exitCode == 0) { "Did not exit successfully" }

            OBJECT_MAPPER.readValue(processOutput.stdout)
        } catch (e: Exception) {
            LOG.warn(e) { "Unable to describe the instrumentation status of the resource cluster:$clusterName service:$serviceName!" }
            null
        }
    }

    // Do a best effort shutdown of cloud debug dispatcher
    fun shutdownCloudDebugDispatcher(messageEmitter: MessageEmitter? = null) {
        val shutdownTask = try {
            CloudDebugCliValidate.validateAndLoadCloudDebugExecutable()
        } catch (e: Exception) {
            LOG.warn(e) { "Failed to validate cloud debug executable while attempting to do a describe call" }
            return
        }
        val generalCommandLine = shutdownTask.getCommandLine().withParameters("shutdown")
        try {
            val handler = CapturingProcessHandler(generalCommandLine)
            handler.addProcessListener(object : ProcessAdapter() {
                override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                    messageEmitter?.emitMessage(event.text, outputType == ProcessOutputTypes.STDERR)
                }
            })
            handler.runProcess(TimeUnit.SECONDS.toMillis(5).toInt())
        } catch (e: Exception) {
            LOG.warn(e) { "Unable to shutdown the local dispatcher!" }
            messageEmitter?.emitMessage("Unable to shutdown the local dispatcher $e", true)
        }
    }

    private fun callListInstrumentedResources(generalCommandLine: GeneralCommandLine, results: MutableSet<ListResultEntry>, nextToken: String?): String? {
        nextToken?.let {
            generalCommandLine.parametersList.replaceOrAppend("--next-token", nextToken)
        }

        val processOutput = CapturingProcessRunner(
            ProcessHandlerFactory.getInstance().createProcessHandler(generalCommandLine)
        ).runProcess(TimeUnit.SECONDS.toMillis(30).toInt()) // TODO: Is this a good timeout? It will make AWS calls...

        check(!processOutput.isTimeout) { "Timed out" }
        check(processOutput.exitCode == 0) { "Did not exit successfully" }

        val cliResult = OBJECT_MAPPER.readValue<ListInstrumentedResources>(processOutput.stdout)
        results.addAll(cliResult.resources)

        return cliResult.nextToken
    }

    data class DescribeResult(
        val taskRole: String,
        val status: String,
        val debugServiceName: String
    )

    data class ListResultEntry(
        @JsonProperty("type") val serviceType: String,
        val clusterName: String,
        val serviceName: String
    )

    private data class ListInstrumentedResources(
        val resources: List<ListResultEntry>,
        @JsonProperty("next-token") val nextToken: String
    )

    private val LOG = getLogger<CloudDebuggingResources>()
}
