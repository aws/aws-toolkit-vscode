// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.ui

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.apprunner.AppRunnerClient
import software.amazon.awssdk.services.apprunner.model.AppRunnerException
import software.amazon.awssdk.services.apprunner.model.ConfigurationSource
import software.amazon.awssdk.services.apprunner.model.CreateServiceRequest
import software.amazon.awssdk.services.apprunner.model.ImageRepositoryType
import software.amazon.awssdk.services.apprunner.model.SourceCodeVersionType
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.services.apprunner.resources.AppRunnerResources
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AppRunnerServiceSource
import software.aws.toolkits.telemetry.ApprunnerTelemetry
import software.aws.toolkits.telemetry.Result
import javax.swing.JComponent

class CreationDialog(private val project: Project, ecrUri: String? = null) :
    DialogWrapper(project) {
    private val coroutineScope = projectCoroutineScope(project)
    val panel = CreationPanel(project, ecrUri)

    init {
        super.init()
        title = message("apprunner.creation.title")
        setOKButtonText(message("general.create_button"))
    }

    override fun createCenterPanel(): JComponent = panel.component

    override fun doCancelAction() {
        ApprunnerTelemetry.createService(project = project, result = Result.Cancelled, appRunnerServiceSource = deploymentTypeFromPanel(panel))
        super.doCancelAction()
    }

    override fun doOKAction() {
        if (!isOKActionEnabled) {
            return
        }
        isOKActionEnabled = false
        setOKButtonText(message("general.create_in_progress"))
        panel.component.apply()
        coroutineScope.launch {
            try {
                val client = project.awsClient<AppRunnerClient>()
                val request = buildRequest(panel)
                // TODO use the operation id to allow opening logs? Unfortunately, it takes up to 30
                // seconds to create so maybe not?
                client.createService(request)
                notifyInfo(
                    project = project,
                    title = message("apprunner.creation.started.title"),
                    content = message("apprunner.creation.started")
                )
                withContext(getCoroutineUiContext()) {
                    close(OK_EXIT_CODE)
                    project.refreshAwsTree(AppRunnerResources.LIST_SERVICES)
                }
                ApprunnerTelemetry.createService(project = project, result = Result.Succeeded, appRunnerServiceSource = deploymentTypeFromPanel(panel))
            } catch (e: Exception) {
                if (e is AppRunnerException) {
                    setErrorText(e.awsErrorDetails()?.errorMessage() ?: message("apprunner.creation.failed"))
                } else {
                    setErrorText(message("apprunner.creation.failed"))
                }
                LOG.error(e) { "Exception thrown while creating AppRunner Service" }
                ApprunnerTelemetry.createService(project = project, result = Result.Failed, appRunnerServiceSource = deploymentTypeFromPanel(panel))
            } finally {
                isOKActionEnabled = true
                setOKButtonText(message("general.create_button"))
            }
        }
    }

    internal fun buildRequest(panel: CreationPanel): CreateServiceRequest {
        val request = CreateServiceRequest.builder()
            .serviceName(panel.name)
            .instanceConfiguration {
                it.cpu(panel.cpu)
                it.memory(panel.memory)
            }
        when {
            panel.ecr.isSelected -> {
                request.sourceConfiguration { source ->
                    source.autoDeploymentsEnabled(panel.automaticDeployment.isSelected)
                    source.imageRepository { image ->
                        image.imageRepositoryType(ImageRepositoryType.ECR)
                        image.imageIdentifier(panel.containerUri)
                        image.imageConfiguration {
                            it.port(panel.port.toString())
                            it.runtimeEnvironmentVariables(panel.environmentVariables.envVars)
                            panel.startCommand?.let { s -> it.startCommand(s) }
                        }
                    }
                    source.authenticationConfiguration {
                        it.accessRoleArn(panel.ecrPolicy.selected()?.arn)
                    }
                }
            }
            panel.ecrPublic.isSelected -> {
                request.sourceConfiguration { source ->
                    source.imageRepository { image ->
                        image.imageRepositoryType(ImageRepositoryType.ECR_PUBLIC)
                        image.imageIdentifier(panel.containerUri)
                        image.imageConfiguration {
                            it.port(panel.port.toString())
                            it.runtimeEnvironmentVariables(panel.environmentVariables.envVars)
                            panel.startCommand?.let { s -> it.startCommand(s) }
                        }
                    }
                }
            }
            panel.repo.isSelected -> {
                request.sourceConfiguration { source ->
                    source.autoDeploymentsEnabled(panel.automaticDeployment.isSelected)
                    source.codeRepository { repo ->
                        repo.codeConfiguration {
                            if (panel.manualDeployment.isSelected) {
                                it.configurationSource(ConfigurationSource.REPOSITORY)
                            } else {
                                it.configurationSource(ConfigurationSource.API)
                                it.codeConfigurationValues { codeConfig ->
                                    codeConfig.runtime(panel.runtime)
                                    codeConfig.port(panel.port.toString())
                                    codeConfig.buildCommand(panel.buildCommand)
                                    codeConfig.startCommand(panel.startCommand)
                                    codeConfig.runtimeEnvironmentVariables(panel.environmentVariables.envVars)
                                }
                            }
                        }
                        repo.repositoryUrl(panel.repository)
                        repo.sourceCodeVersion {
                            it.type(SourceCodeVersionType.BRANCH)
                            it.value(panel.branch)
                        }
                    }
                    source.authenticationConfiguration { it.connectionArn(panel.connection.selected()?.connectionArn()) }
                }
            }
            else -> throw IllegalStateException("AppRunner creation dialog had no type selected!")
        }
        return request.build()
    }

    private fun deploymentTypeFromPanel(panel: CreationPanel) = when {
        panel.repo.isSelected -> AppRunnerServiceSource.Repository
        panel.ecrPublic.isSelected -> AppRunnerServiceSource.EcrPublic
        panel.ecr.isSelected -> AppRunnerServiceSource.Ecr
        else -> AppRunnerServiceSource.Unknown
    }

    private companion object {
        val LOG = getLogger<CreationDialog>()
    }
}
