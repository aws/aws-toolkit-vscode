// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.configurations.RunProfile
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.configurations.RunnerSettings
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.runners.AsyncProgramRunner
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.ui.RunContentDescriptor
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleUtil
import com.intellij.psi.PsiFile
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import org.slf4j.event.Level
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.telemetry.DefaultMetricEvent.Companion.METADATA_INVALID
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.services.PathMapping
import software.aws.toolkits.jetbrains.services.lambda.BuildLambdaFromHandler
import software.aws.toolkits.jetbrains.services.lambda.BuildLambdaFromTemplate
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderUtils
import software.aws.toolkits.jetbrains.services.lambda.execution.local.LocalLambdaRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.lambda.validOrNull
import software.aws.toolkits.jetbrains.services.sts.StsResources
import software.aws.toolkits.jetbrains.services.telemetry.MetricEventMetadata
import software.aws.toolkits.telemetry.LambdaPackageType
import software.aws.toolkits.telemetry.LambdaTelemetry
import java.io.File
import software.aws.toolkits.telemetry.Runtime as TelemetryRuntime

class SamInvokeRunner : AsyncProgramRunner<RunnerSettings>() {
    override fun getRunnerId(): String = "SamInvokeRunner"

    override fun canRun(executorId: String, profile: RunProfile): Boolean {
        if (profile !is LocalLambdaRunConfiguration) {
            return false
        }

        if (DefaultRunExecutor.EXECUTOR_ID == executorId) {
            // Always true so that the run icon is shown, error is then told to user that runtime doesnt work
            return true
        }

        if (DefaultDebugExecutor.EXECUTOR_ID != executorId) {
            // Only support debugging if it is the default executor
            return false
        }

        val runtimeValue = if (profile.isUsingTemplate() && !profile.isImage) {
            LOG.tryOrNull("Failed to get runtime of ${profile.logicalId()}", Level.WARN) {
                SamTemplateUtils.findZipFunctionsFromTemplate(profile.project, File(profile.templateFile()))
                    .find { it.logicalName == profile.logicalId() }
                    ?.runtime()
                    ?.let {
                        Runtime.fromValue(it)?.validOrNull
                    }
            }
        } else {
            profile.runtime()
        }

        val runtimeGroup = runtimeValue?.runtimeGroup ?: return false

        return SamDebugSupport.supportedRuntimeGroups().contains(runtimeGroup) &&
            SamDebugSupport.getInstanceOrNull(runtimeGroup)?.isSupported(runtimeValue) ?: false
    }

    override fun execute(environment: ExecutionEnvironment, state: RunProfileState): Promise<RunContentDescriptor?> {
        FileDocumentManager.getInstance().saveAllDocuments()

        val buildingPromise = AsyncPromise<RunContentDescriptor?>()
        val samState = state as SamRunningState
        val lambdaSettings = samState.settings
        val module = when (lambdaSettings) {
            // TODO long term module should be removed for Template based configurations
            // So, we need a Module. Why? for build directory. We use handler for this to set build directory, and that's it.
            // So, base it off of the template file for now. Later, we should more explicitly do this lower.
            is TemplateRunSettings ->
                ModuleUtil.findModuleForFile(lambdaSettings.templateFile, environment.project)
                    ?: throw IllegalStateException("Failed to locate module for ${lambdaSettings.templateFile}")
            is HandlerRunSettings -> getModule(lambdaSettings.handlerElement.containingFile)
            is ImageTemplateRunSettings -> {
                ModuleUtil.findModuleForFile(lambdaSettings.dockerFile, environment.project)
                    ?: throw IllegalStateException("Failed to locate module for ${lambdaSettings.dockerFile}")
            }
        }
        val runtimeGroup = lambdaSettings.runtimeGroup

        val buildRequest = when (lambdaSettings) {
            is TemplateRunSettings ->
                BuildLambdaFromTemplate(
                    lambdaSettings.templateFile,
                    lambdaSettings.logicalId,
                    lambdaSettings.samOptions
                )
            is ImageTemplateRunSettings ->
                BuildLambdaFromTemplate(
                    lambdaSettings.templateFile,
                    lambdaSettings.logicalId,
                    lambdaSettings.samOptions
                )
            is HandlerRunSettings ->
                BuildLambdaFromHandler(
                    lambdaSettings.handlerElement,
                    lambdaSettings.handler,
                    lambdaSettings.runtime,
                    lambdaSettings.timeout,
                    lambdaSettings.memorySize,
                    lambdaSettings.environmentVariables,
                    lambdaSettings.samOptions
                )
        }

        LambdaBuilderUtils.buildAndReport(module, runtimeGroup, buildRequest)
            .thenAccept { built ->
                val builtLambda = if (lambdaSettings is ImageTemplateRunSettings) {
                    // This needs to be a bit smart. If a user set local path matches a default path, we need to make sure that is the one set
                    // by removing the default set one.
                    val userMappings = lambdaSettings.pathMappings.map { PathMapping(it.localRoot, it.remoteRoot) }
                    val mappings = userMappings + built.mappings.filterNot { defaultMapping -> userMappings.any { defaultMapping.localRoot == it.localRoot } }
                    built.copy(mappings = mappings)
                } else {
                    built
                }
                samState.runner.checkDockerInstalled()
                runInEdt {
                    samState.builtLambda = builtLambda
                    samState.runner.run(environment, samState)
                        .onSuccess {
                            buildingPromise.setResult(it)
                        }.onError {
                            buildingPromise.setError(it)
                        }
                }
            }.exceptionally {
                LOG.warn(it) { "Failed to create Lambda package" }
                buildingPromise.setError(it)
                throw it
            }.whenComplete { _, exception ->
                val account = AwsResourceCache.getInstance()
                    .getResourceIfPresent(StsResources.ACCOUNT, lambdaSettings.connection)

                LambdaTelemetry.invokeLocal(
                    metadata = MetricEventMetadata(
                        awsAccount = account ?: METADATA_INVALID,
                        awsRegion = lambdaSettings.connection.region.id
                    ),
                    debug = environment.isDebug(),
                    runtime = TelemetryRuntime.from(lambdaSettings.runtime.toString()),
                    lambdaPackageType = if (lambdaSettings is ImageTemplateRunSettings) LambdaPackageType.Image else LambdaPackageType.Zip,
                    success = exception == null
                )
            }

        return buildingPromise
    }

    private fun getModule(psiFile: PsiFile): Module = ModuleUtil.findModuleForFile(psiFile)
        ?: throw java.lang.IllegalStateException("Failed to locate module for $psiFile")

    private fun ExecutionEnvironment.isDebug(): Boolean = (executor.id == DefaultDebugExecutor.EXECUTOR_ID)

    private companion object {
        val LOG = getLogger<SamInvokeRunner>()
    }
}
