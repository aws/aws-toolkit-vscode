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
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import org.jetbrains.concurrency.AsyncPromise
import org.jetbrains.concurrency.Promise
import org.slf4j.event.Level
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.lambda.validOrNull
import software.aws.toolkits.core.telemetry.DefaultMetricEvent.Companion.METADATA_INVALID
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.services.PathMapping
import software.aws.toolkits.jetbrains.services.lambda.Lambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.execution.local.LocalLambdaRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.lambda.upload.steps.BuildLambda
import software.aws.toolkits.jetbrains.services.sts.StsResources
import software.aws.toolkits.jetbrains.services.telemetry.MetricEventMetadata
import software.aws.toolkits.jetbrains.utils.execution.steps.StepExecutor
import software.aws.toolkits.jetbrains.utils.execution.steps.StepWorkflow
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.LambdaPackageType
import software.aws.toolkits.telemetry.LambdaTelemetry
import software.aws.toolkits.telemetry.Result
import java.io.File
import java.nio.file.Path
import java.nio.file.Paths
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
        } else if (!profile.isImage) {
            profile.runtime()?.toSdkRuntime()
        } else {
            null
        }
        val runtimeGroup = runtimeValue?.runtimeGroup

        val canRunRuntime = runtimeGroup != null &&
            RuntimeDebugSupport.supportedRuntimeGroups().contains(runtimeGroup) &&
            RuntimeDebugSupport.getInstanceOrNull(runtimeGroup)?.isSupported(runtimeValue) ?: false
        val canRunImage = profile.isImage && profile.imageDebugger() != null

        return canRunRuntime || canRunImage
    }

    override fun execute(environment: ExecutionEnvironment, state: RunProfileState): Promise<RunContentDescriptor?> {
        FileDocumentManager.getInstance().saveAllDocuments()

        val buildingPromise = AsyncPromise<RunContentDescriptor?>()
        val samState = state as SamRunningState
        val lambdaSettings = samState.settings
        val lambdaBuilder = LambdaBuilder.getInstance(lambdaSettings.runtimeGroup)

        val buildLambdaRequest = when (lambdaSettings) {
            is TemplateRunSettings ->
                buildLambdaFromTemplate(
                    lambdaSettings.templateFile,
                    lambdaSettings.logicalId,
                    lambdaSettings.samOptions
                )
            is ImageTemplateRunSettings ->
                buildLambdaFromTemplate(
                    lambdaSettings.templateFile,
                    lambdaSettings.logicalId,
                    lambdaSettings.samOptions
                )
            is HandlerRunSettings ->
                buildLambdaFromHandler(
                    lambdaBuilder,
                    environment.project,
                    lambdaSettings
                )
        }

        val buildWorkflow = buildWorkflow(environment, buildLambdaRequest, lambdaSettings.samOptions)
        buildWorkflow.onSuccess = { context ->
            samState.runner.checkDockerInstalled()

            val builtLambda = context.getRequiredAttribute(BuildLambda.BUILT_LAMBDA)
            samState.builtLambda = builtLambda
            samState.pathMappings = createPathMappings(lambdaBuilder, lambdaSettings, buildLambdaRequest)

            samState.runner.run(environment, samState)
                .onSuccess {
                    buildingPromise.setResult(it)
                    reportMetric(lambdaSettings, Result.Succeeded, environment.isDebug())
                }.onError {
                    buildingPromise.setError(it)
                    reportMetric(lambdaSettings, Result.Failed, environment.isDebug())
                }
        }
        buildWorkflow.onError = {
            LOG.warn(it) { "Failed to create Lambda package" }
            buildingPromise.setError(it)
            reportMetric(lambdaSettings, Result.Failed, environment.isDebug())
        }

        buildWorkflow.startExecution()

        return buildingPromise
    }

    private fun createPathMappings(lambdaBuilder: LambdaBuilder, settings: LocalLambdaRunSettings, buildRequest: BuildRequest): List<PathMapping> {
        val defaultPathMappings = lambdaBuilder.defaultPathMappings(buildRequest.template, buildRequest.logicalId, buildRequest.buildDir)
        return if (settings is ImageTemplateRunSettings) {
            // This needs to be a bit smart. If a user set local path matches a default path, we need to make sure that is the one set
            // by removing the default set one.
            val userMappings = settings.pathMappings.map { PathMapping(it.localRoot, it.remoteRoot) }
            userMappings + defaultPathMappings.filterNot { defaultMapping -> userMappings.any { defaultMapping.localRoot == it.localRoot } }
        } else {
            defaultPathMappings
        }
    }

    private fun reportMetric(lambdaSettings: LocalLambdaRunSettings, result: Result, isDebug: Boolean) {
        val account = AwsResourceCache.getInstance()
            .getResourceIfPresent(StsResources.ACCOUNT, lambdaSettings.connection)

        LambdaTelemetry.invokeLocal(
            metadata = MetricEventMetadata(
                awsAccount = account ?: METADATA_INVALID,
                awsRegion = lambdaSettings.connection.region.id
            ),
            debug = isDebug,
            runtime = TelemetryRuntime.from(
                when (lambdaSettings) {
                    is ZipSettings -> {
                        lambdaSettings.runtime.toString()
                    }
                    is ImageSettings -> {
                        lambdaSettings.imageDebugger.id
                    }
                    else -> {
                        ""
                    }
                }
            ),
            lambdaPackageType = if (lambdaSettings is ImageTemplateRunSettings) LambdaPackageType.Image else LambdaPackageType.Zip,
            result = result
        )
    }

    // TODO: We actually probably want to split this for image templates and handler templates to enable build env vars for handler based
    private fun buildLambdaFromTemplate(templateFile: VirtualFile, logicalId: String, samOptions: SamOptions): BuildRequest {
        val templatePath = Paths.get(templateFile.path)
        val buildDir = templatePath.resolveSibling(".aws-sam").resolve("build")

        return BuildRequest(templatePath, logicalId, emptyMap(), buildDir)
    }

    private fun buildLambdaFromHandler(lambdaBuilder: LambdaBuilder, project: Project, settings: HandlerRunSettings): BuildRequest {
        val samOptions = settings.samOptions
        val runtime = settings.runtime
        val handler = settings.handler

        val element = Lambda.findPsiElementsForHandler(project, runtime, handler).first()
        val module = getModule(element.containingFile)

        val buildDirectory = lambdaBuilder.getBuildDirectory(module)
        val dummyTemplate = buildDirectory.parent.resolve("temp-template.yaml")
        val dummyLogicalId = "Function"

        SamTemplateUtils.writeDummySamTemplate(
            tempFile = dummyTemplate,
            logicalId = dummyLogicalId,
            runtime = runtime,
            handler = handler,
            timeout = settings.timeout,
            memorySize = settings.memorySize,
            codeUri = lambdaBuilder.handlerBaseDirectory(module, element).toAbsolutePath().toString(),
            envVars = settings.environmentVariables
        )

        return BuildRequest(
            dummyTemplate,
            dummyLogicalId,
            lambdaBuilder.additionalBuildEnvironmentVariables(module, samOptions),
            buildDirectory
        )
    }

    private fun buildWorkflow(environment: ExecutionEnvironment, buildRequest: BuildRequest, samOptions: SamOptions): StepExecutor {
        val buildStep = BuildLambda(buildRequest.template, buildRequest.logicalId, buildRequest.buildDir, buildRequest.buildEnvVars, samOptions)

        return StepExecutor(environment.project, message("sam.build.running"), StepWorkflow(buildStep), environment.executionId.toString())
    }

    private fun getModule(psiFile: PsiFile): Module = ModuleUtil.findModuleForFile(psiFile)
        ?: throw IllegalStateException("Failed to locate module for $psiFile")

    private fun ExecutionEnvironment.isDebug(): Boolean = (executor.id == DefaultDebugExecutor.EXECUTOR_ID)

    private data class BuildRequest(val template: Path, val logicalId: String, val buildEnvVars: Map<String, String>, val buildDir: Path)

    private companion object {
        val LOG = getLogger<SamInvokeRunner>()
    }
}
