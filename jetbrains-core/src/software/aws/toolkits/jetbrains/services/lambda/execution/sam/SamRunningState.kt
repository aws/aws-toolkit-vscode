// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.build.BuildView
import com.intellij.build.DefaultBuildDescriptor
import com.intellij.build.ViewManager
import com.intellij.execution.DefaultExecutionResult
import com.intellij.execution.ExecutionResult
import com.intellij.execution.Executor
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.execution.runners.ProgramRunner
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.core.telemetry.DefaultMetricEvent
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.utils.buildList
import software.aws.toolkits.jetbrains.services.PathMapping
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.steps.AttachDebugger
import software.aws.toolkits.jetbrains.services.lambda.steps.AttachDebuggerParent
import software.aws.toolkits.jetbrains.services.lambda.steps.BuildLambda
import software.aws.toolkits.jetbrains.services.lambda.steps.BuildLambdaRequest
import software.aws.toolkits.jetbrains.services.lambda.steps.GetPorts
import software.aws.toolkits.jetbrains.services.lambda.steps.SamRunnerStep
import software.aws.toolkits.jetbrains.services.sts.StsResources
import software.aws.toolkits.jetbrains.services.telemetry.MetricEventMetadata
import software.aws.toolkits.jetbrains.utils.execution.steps.BuildViewWorkflowEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.ParallelStep
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.jetbrains.utils.execution.steps.StepExecutor
import software.aws.toolkits.jetbrains.utils.execution.steps.StepWorkflow
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.LambdaPackageType
import software.aws.toolkits.telemetry.LambdaTelemetry
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.Runtime
import java.nio.file.Paths

class SamRunningState(
    val environment: ExecutionEnvironment,
    val settings: LocalLambdaRunSettings
) : RunProfileState {
    lateinit var pathMappings: List<PathMapping>

    override fun execute(executor: Executor, runner: ProgramRunner<*>): ExecutionResult {
        val project = environment.project
        val descriptor = DefaultBuildDescriptor(
            runConfigId(),
            message("lambda.run_configuration.sam"),
            "/unused/location",
            System.currentTimeMillis()
        )

        val buildView = BuildView(
            project,
            descriptor,
            null,
            object : ViewManager {
                override fun isConsoleEnabledByDefault() = false

                override fun isBuildContentView() = true
            }
        )

        val lambdaBuilder = LambdaBuilder.getInstance(settings.runtimeGroup)

        val buildLambdaRequest = buildBuildLambdaRequest(environment.project, settings)

        pathMappings = createPathMappings(lambdaBuilder, settings, buildLambdaRequest)
        val buildWorkflow = buildWorkflow(environment, settings, this, buildLambdaRequest, buildView)

        return DefaultExecutionResult(buildView, buildWorkflow)
    }

    private fun createPathMappings(lambdaBuilder: LambdaBuilder, settings: LocalLambdaRunSettings, buildRequest: BuildLambdaRequest): List<PathMapping> {
        val defaultPathMappings = lambdaBuilder.defaultPathMappings(buildRequest.templatePath, buildRequest.logicalId ?: dummyLogicalId, buildRequest.buildDir)
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
                awsAccount = account ?: DefaultMetricEvent.METADATA_INVALID,
                awsRegion = lambdaSettings.connection.region.id
            ),
            debug = isDebug,
            runtime = Runtime.from(
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
            version = SamCommon.getVersionString(),
            lambdaPackageType = if (lambdaSettings is ImageTemplateRunSettings) LambdaPackageType.Image else LambdaPackageType.Zip,
            result = result
        )
    }

    private fun buildWorkflow(
        environment: ExecutionEnvironment,
        settings: LocalLambdaRunSettings,
        state: SamRunningState,
        buildRequest: BuildLambdaRequest,
        buildView: BuildView
    ): ProcessHandler {
        val startSam = SamRunnerStep(environment, settings, environment.isDebug())

        val workflow = StepWorkflow(
            buildList {
                add(ValidateDocker())
                if (buildRequest.preBuildSteps.isNotEmpty()) {
                    addAll(buildRequest.preBuildSteps)
                }
                add(BuildLambda(buildRequest))
                if (environment.isDebug()) {
                    add(GetPorts(settings))
                    add(object : ParallelStep() {
                        override fun buildChildSteps(context: Context): List<Step> = listOf(
                            startSam,
                            AttachDebuggerParent(
                                state.settings.resolveDebuggerSupport().additionalDebugProcessSteps(environment, state) +
                                    AttachDebugger(
                                        environment,
                                        state
                                    )
                            )
                        )

                        override val stepName: String = ""
                        override val hidden: Boolean = true
                    })
                } else {
                    add(startSam)
                }
            }
        )
        val emitter = BuildViewWorkflowEmitter.createEmitter(buildView, message("sam.build.running"), environment.executionId.toString())
        val executor = StepExecutor(environment.project, workflow, emitter)
        executor.onSuccess = {
            reportMetric(settings, Result.Succeeded, environment.isDebug())
        }
        executor.onError = {
            reportMetric(settings, Result.Failed, environment.isDebug())
        }

        // Let run config system start the execution through the process handler
        return executor.getProcessHandler()
    }

    private fun runConfigId() = environment.executionId.toString()

    companion object {
        private const val dummyLogicalId = "Function"

        internal fun buildBuildLambdaRequest(project: Project, lambdaSettings: LocalLambdaRunSettings) = when (lambdaSettings) {
            is TemplateRunSettings ->
                buildLambdaFromTemplate(
                    project,
                    lambdaSettings
                )
            is ImageTemplateRunSettings ->
                buildLambdaFromTemplate(
                    project,
                    lambdaSettings
                )
            is HandlerRunSettings ->
                lambdaSettings.lambdaBuilder().buildFromHandler(
                    project,
                    lambdaSettings
                )
        }

        private fun buildLambdaFromTemplate(
            project: Project,
            lambdaSettings: TemplateRunSettings,
        ): BuildLambdaRequest = buildLambdaFromTemplate(
            project,
            lambdaSettings.lambdaBuilder(),
            lambdaSettings.templateFile,
            lambdaSettings.logicalId,
            lambdaSettings.samOptions
        )

        private fun buildLambdaFromTemplate(
            project: Project,
            lambdaSettings: ImageTemplateRunSettings,
        ): BuildLambdaRequest = buildLambdaFromTemplate(
            project,
            lambdaSettings.lambdaBuilder(),
            lambdaSettings.templateFile,
            lambdaSettings.logicalId,
            lambdaSettings.samOptions
        )

        private fun buildLambdaFromTemplate(
            project: Project,
            lambdaBuilder: LambdaBuilder,
            templateFile: VirtualFile,
            logicalId: String,
            samOptions: SamOptions
        ): BuildLambdaRequest {
            val templatePath = Paths.get(templateFile.path)
            val buildDir = templatePath.resolveSibling(".aws-sam").resolve("build")
            val module = ModuleUtil.findModuleForFile(templateFile, project)
            val additionalBuildEnvironmentVariables = lambdaBuilder.additionalBuildEnvironmentVariables(project, module, samOptions)

            return BuildLambdaRequest(templatePath, logicalId, buildDir, additionalBuildEnvironmentVariables, samOptions)
        }

        private fun LocalLambdaRunSettings.lambdaBuilder() = LambdaBuilder.getInstance(this.runtimeGroup)

        private fun ExecutionEnvironment.isDebug(): Boolean = (executor.id == DefaultDebugExecutor.EXECUTOR_ID)
    }
}
