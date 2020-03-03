// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

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
import software.aws.toolkits.jetbrains.services.lambda.BuildLambdaFromHandler
import software.aws.toolkits.jetbrains.services.lambda.BuildLambdaFromTemplate
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilderUtils
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.lambda.validOrNull
import software.aws.toolkits.jetbrains.services.sts.StsResources
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import java.io.File

class SamInvokeRunner : AsyncProgramRunner<RunnerSettings>() {
    override fun getRunnerId(): String = "SamInvokeRunner"

    override fun canRun(executorId: String, profile: RunProfile): Boolean {
        if (profile !is LocalLambdaRunConfiguration) {
            return false
        }

        if (DefaultRunExecutor.EXECUTOR_ID == executorId) {
            return true // Always true so that the run icon is shown, error is then told to user that runtime doesnt work
        }

        // Requires SamDebugSupport too
        if (DefaultDebugExecutor.EXECUTOR_ID == executorId) {
            val runtimeValue = if (profile.isUsingTemplate()) {
                LOG.tryOrNull("Failed to get runtime of ${profile.logicalId()}", Level.WARN) {
                    SamTemplateUtils.findFunctionsFromTemplate(profile.project, File(profile.templateFile()))
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

            return SamDebugSupport.supportedRuntimeGroups.contains(runtimeGroup) &&
                SamDebugSupport.getInstance(runtimeGroup)?.isSupported() ?: false
        }

        return false
    }

    override fun execute(environment: ExecutionEnvironment, state: RunProfileState): Promise<RunContentDescriptor?> {
        FileDocumentManager.getInstance().saveAllDocuments()

        val buildingPromise = AsyncPromise<RunContentDescriptor?>()
        val samState = state as SamRunningState
        val lambdaSettings = samState.settings
        val module = getModule(samState.settings.handlerElement.containingFile)
        val runtimeGroup = lambdaSettings.runtimeGroup

        val buildRequest = if (lambdaSettings.templateDetails?.templateFile != null) {
            BuildLambdaFromTemplate(
                lambdaSettings.templateDetails.templateFile,
                lambdaSettings.templateDetails.logicalName,
                lambdaSettings.samOptions
            )
        } else {
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
            .thenAccept {
                samState.runner.checkDockerInstalled()
                runInEdt {
                    samState.builtLambda = it
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
                AwsResourceCache.getInstance(state.environment.project)
                    .getResource(StsResources.ACCOUNT, lambdaSettings.region, lambdaSettings.credentials)
                    .whenComplete { account, _ ->
                        TelemetryService.getInstance().record(
                            TelemetryService.MetricEventMetadata(
                                awsAccount = account ?: METADATA_INVALID,
                                awsRegion = lambdaSettings.region.id
                            )
                        ) {
                            val type = if (environment.isDebug()) "Debug" else "Run"
                            datum("SamInvoke.$type") {
                                count()
                                // exception can be null but is not annotated as nullable
                                metadata("hasException", exception != null)
                                metadata("runtime", lambdaSettings.runtime.name)
                                metadata("samVersion", SamCommon.getVersionString())
                                metadata("templateBased", buildRequest is BuildLambdaFromTemplate)
                            }
                        }
                    }
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
