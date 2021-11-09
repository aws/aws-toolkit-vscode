// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.exec

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.ec2.Ec2Client
import software.amazon.awssdk.services.ecs.EcsClient
import software.amazon.awssdk.services.ecs.model.DeploymentRolloutState
import software.amazon.awssdk.services.ecs.model.DescribeServicesRequest
import software.amazon.awssdk.services.ecs.model.InvalidParameterException
import software.amazon.awssdk.services.ecs.model.LaunchType
import software.amazon.awssdk.services.ecs.model.Service
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.iam.model.PolicyEvaluationDecisionType
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.toEnvironmentVariables
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.getConnectionSettingsOrThrow
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.core.getResourceNow
import software.aws.toolkits.jetbrains.core.tools.getOrInstallTool
import software.aws.toolkits.jetbrains.services.ecs.ContainerDetails
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import software.aws.toolkits.jetbrains.services.ssm.SsmPlugin
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.jetbrains.utils.notifyWarn
import software.aws.toolkits.jetbrains.utils.runUnderProgressIfNeeded
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.EcsTelemetry
import software.aws.toolkits.telemetry.Result
import software.amazon.awssdk.services.ecs.model.Task as EcsTask

object EcsExecUtils {
    private val MAPPER = jacksonObjectMapper()
    private const val SESSION_MANAGER_CREATE_CONTROL_CHANNEL_PERMISSION = "ssmmessages:CreateControlChannel"
    private const val SESSION_MANAGER_CREATE_DATA_CHANNEL_PERMISSION = "ssmmessages:CreateDataChannel"
    private const val SESSION_MANAGER_OPEN_CONTROL_CHANNEL_PERMISSION = "ssmmessages:OpenControlChannel"
    private const val SESSION_MANAGER_OPEN_DATA_CHANNEL_PERMISSION = "ssmmessages:OpenDataChannel"

    fun updateExecuteCommandFlag(project: Project, service: Service, enabled: Boolean) {
        if (ensureServiceIsInStableState(project, service)) {
            try {
                project.awsClient<EcsClient>().updateService {
                    it.cluster(service.clusterArn())
                    it.service(service.serviceName())
                    it.enableExecuteCommand(enabled)
                    it.forceNewDeployment(true)
                }
                checkServiceState(project, service, enabled)
            } catch (e: InvalidParameterException) {
                runInEdt {
                    TaskRoleNotFoundWarningDialog(project).show()
                    EcsTelemetry.enableExecuteCommand(project, Result.Failed)
                }
            }
        } else {
            if (enabled) {
                notifyWarn(
                    title = message("ecs.execute_command_enable"),
                    content = message("ecs.execute_command_enable_in_progress", service.serviceName()),
                    project = project
                )
            } else {
                notifyWarn(
                    title = message("ecs.execute_command_disable"),
                    content = message("ecs.execute_command_disable_in_progress", service.serviceName()),
                    project = project
                )
            }
        }
    }

    private fun checkServiceState(project: Project, service: Service, enable: Boolean) {
        val title = if (enable) {
            message("ecs.execute_command_enable_progress_indicator_message", service.serviceName())
        } else {
            message("ecs.execute_command_disable_progress_indicator_message", service.serviceName())
        }

        ProgressManager.getInstance().run(
            object : Task.Backgroundable(project, title, false) {
                override fun run(indicator: ProgressIndicator) {
                    val request = DescribeServicesRequest.builder().cluster(service.clusterArn()).services(service.serviceArn()).build()
                    val client = project.awsClient<EcsClient>()
                    val waiter = client.waiter()
                    waiter.waitUntilServicesStable(request)
                }

                override fun onSuccess() {
                    val currentConnectionSettings = project.getConnectionSettingsOrThrow()
                    project.refreshAwsTree(EcsResources.describeService(service.clusterArn(), service.serviceArn()), currentConnectionSettings)

                    if (enable) {
                        notifyInfo(
                            title = message("ecs.execute_command_enable"),
                            content = message("ecs.execute_command_enable_success", service.serviceName()),
                            project = project
                        )
                        EcsTelemetry.enableExecuteCommand(project, Result.Succeeded)
                    } else {
                        notifyInfo(
                            title = message("ecs.execute_command_disable"),
                            content = message("ecs.execute_command_disable_success", service.serviceName()),
                            project = project
                        )
                        EcsTelemetry.disableExecuteCommand(project, Result.Succeeded)
                    }
                }

                override fun onThrowable(error: Throwable) {
                    if (enable) {
                        notifyError(
                            title = message("ecs.execute_command_enable"),
                            content = message("ecs.execute_command_enable_failed", service.serviceName()),
                            project = project
                        )
                        EcsTelemetry.enableExecuteCommand(project, Result.Failed)
                    } else {
                        notifyError(
                            title = message("ecs.execute_command_disable"),
                            content = message("ecs.execute_command_disable_failed", service.serviceName()),
                            project = project
                        )
                        EcsTelemetry.disableExecuteCommand(project, Result.Failed)
                    }
                }
            }
        )
    }

    private fun getEc2InstanceTaskRoleArn(project: Project, clusterArn: String, ecsClient: EcsClient, task: EcsTask): String? {
        try {
            val iamClient = project.awsClient<IamClient>()
            val containerInstanceArn = task.containerInstanceArn()
            val res = ecsClient.describeContainerInstances {
                it.cluster(clusterArn)
                it.containerInstances(containerInstanceArn)
            }
            val ec2InstanceId = res.containerInstances().first().ec2InstanceId()
            val instanceProfileArn = project.awsClient<Ec2Client>().describeInstances {
                it.instanceIds(ec2InstanceId)
            }.reservations().first().instances().first().iamInstanceProfile().arn() ?: return null
            val instanceProfileName = instanceProfileArn.substringAfter(":instance-profile/")
            return iamClient.getInstanceProfile { it.instanceProfileName(instanceProfileName) }.instanceProfile().roles().first().arn() ?: null
        } catch (e: Exception) {
            return null
        }
    }

    fun getTaskRoleArn(project: Project, clusterArn: String, taskArn: String): String? {
        val ecsClient = project.awsClient<EcsClient>()
        val task = ecsClient.describeTasks {
            it.tasks(taskArn)
            it.cluster(clusterArn)
        }.tasks().first()
        return if (task.overrides().taskRoleArn() != null) {
            task.overrides().taskRoleArn()
        } else {
            project.getResourceNow(EcsResources.describeTaskDefinition(task.taskDefinitionArn())).taskRoleArn()
                ?: when (task.launchType()) {
                    LaunchType.EC2 -> getEc2InstanceTaskRoleArn(project, clusterArn, ecsClient, task)
                    LaunchType.FARGATE -> null
                    else -> throw RuntimeException("Launch Type is not supported")
                }
        }
    }

    fun checkRequiredPermissions(project: Project, clusterArn: String, taskArn: String): Boolean {
        try {
            val iamClient = project.awsClient<IamClient>()
            val taskRoleArn = getTaskRoleArn(project, clusterArn, taskArn) ?: return false

            val permissions = listOf(
                SESSION_MANAGER_CREATE_CONTROL_CHANNEL_PERMISSION,
                SESSION_MANAGER_CREATE_DATA_CHANNEL_PERMISSION,
                SESSION_MANAGER_OPEN_CONTROL_CHANNEL_PERMISSION,
                SESSION_MANAGER_OPEN_DATA_CHANNEL_PERMISSION
            )
            val response = iamClient.simulatePrincipalPolicy {
                it.policySourceArn(taskRoleArn)
                it.actionNames(permissions)
            }

            val permissionResults = response.evaluationResults().map { it.evalDecision().name }
            for (permission in permissionResults) {
                if (permission != PolicyEvaluationDecisionType.ALLOWED.name) {
                    return false
                }
            }
        } catch (e: Exception) {
            notifyWarn(
                title = message("ecs.execute_command_permissions_required_title"),
                content = message("ecs.execute_command_permissions_not_verified"),
                project = project
            )
        }
        return true
    }

    fun ensureServiceIsInStableState(project: Project, service: Service): Boolean {
        val response = project.awsClient<EcsClient>().describeServices {
            it.cluster(service.clusterArn())
            it.services(service.serviceArn())
        }
        val deployment = response.services().first().deployments().first()
        val serviceStateChangeInProgress = deployment.rolloutState() == DeploymentRolloutState.IN_PROGRESS || deployment.status() == "ACTIVE"
        return !serviceStateChangeInProgress
    }

    /**
     * Start a session with ECS (calling ECS execute-command) and then pass the resulting
     * session information (along with some other pieces) to the SSM Session Manager Plugin.
     *
     * This replicates logic from the AWS CLI:
     * https://github.com/aws/aws-cli/blob/63f3fcf368805d14848769feae4bbf87cc359739/awscli/customizations/ecs/executecommand.py
     */
    fun createCommand(
        project: Project,
        connection: ConnectionSettings,
        container: ContainerDetails,
        task: String,
        command: String
    ): GeneralCommandLine {
        val client = connection.awsClient<EcsClient>()
        val path = SsmPlugin.getOrInstallTool(project).path.toAbsolutePath().toString()

        val session = runUnderProgressIfNeeded(project, message("ecs.execute_command_call_service"), cancelable = false) {
            client.executeCommand {
                it.cluster(container.service.clusterArn())
                it.task(task)
                it.container(container.containerDefinition.name())
                it.interactive(true)
                it.command(command)
            }
        }

        return GeneralCommandLine()
            .withExePath(path)
            .withParameters(
                MAPPER.writeValueAsString(session.session().toBuilder()),
                connection.region.id,
                "StartSession"
            )
            .withEnvironment(connection.toEnvironmentVariables())
    }
}
