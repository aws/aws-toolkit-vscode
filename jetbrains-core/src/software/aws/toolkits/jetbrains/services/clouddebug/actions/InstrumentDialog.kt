// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import software.amazon.awssdk.services.ecs.EcsClient
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.iam.model.PolicyEvaluationDecisionType
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.services.RoleValidation
import software.aws.toolkits.jetbrains.services.iam.IamResources
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.resources.message
import java.awt.event.ItemEvent
import java.net.URLDecoder
import javax.swing.JPanel

class InstrumentDialog(private val project: Project, val clusterArn: String, val serviceArn: String) : Disposable {
    lateinit var content: JPanel
    lateinit var iamRole: ResourceSelector<IamRole>
    lateinit var roleNotValidWarning: JBLabel

    init {
        roleNotValidWarning.isVisible = false
        roleNotValidWarning.setCopyable(true)
        roleNotValidWarning.setAllowAutoWrapping(true)
        roleNotValidWarning.icon = AllIcons.General.Warning
    }

    private fun createUIComponents() {
        val credentials = ProjectAccountSettingsManager.getInstance(project).activeCredentialProvider
        val region = ProjectAccountSettingsManager.getInstance(project).activeRegion

        iamRole = ResourceSelector.builder(project)
            .resource { IamResources.LIST_ALL }
            .awsConnection { Pair(region, credentials) }
            .build()

        iamRole.addItemListener {
            onIamRoleSelectionChanged(it)
        }

        // In the background, attempt to select a role
        ApplicationManager.getApplication().executeOnPooledThread {
            attemptSelectRole()
        }
    }

    private fun onIamRoleSelectionChanged(itemEvent: ItemEvent) {
        if (itemEvent.stateChange == ItemEvent.DESELECTED) {
            return
        }

        val iamRole = itemEvent.item
        ApplicationManager.getApplication().executeOnPooledThread {
            var roleValidationWarning = message("cloud_debug.instrument_resource.role.not.valid", HelpIds.CLOUD_DEBUG_ENABLE.url)
            var roleValidationVisible = true

            try {
                if (iamRole is IamRole) {
                    roleValidationVisible = !isRoleValid(iamRole)
                }
            } catch (e: Exception) {
                roleValidationWarning = message("cloud_debug.instrument_resource.role.could.not.validate", e.localizedMessage)
                roleValidationVisible = true
            }

            runInEdt(ModalityState.any()) {
                roleNotValidWarning.text = roleValidationWarning
                roleNotValidWarning.isVisible = roleValidationVisible
            }
        }
    }

    private fun isRoleValid(iamRole: IamRole): Boolean {
        try {
            val iamClient = project.awsClient<IamClient>()
            val actionsAllowed = canSimulateCloudDebugActions(iamClient, iamRole.arn)
            if (!actionsAllowed) {
                return false
            }

            return iamRole.name?.let {
                isRolePolicyValid(iamClient, it)
            } ?: throw Exception("This role does not have a name")
        } catch (e: Exception) {
            LOG.warn(e) { "Unable to validate role for Cloud Debugging" }
            throw e
        }
    }

    private fun isRolePolicyValid(iamClient: IamClient, roleName: String): Boolean {
        val role = iamClient.getRole {
            it.roleName(roleName)
        }.role()

        val encodedRolePolicy = role.assumeRolePolicyDocument()
        val rolePolicy = URLDecoder.decode(encodedRolePolicy, "UTF-8")

        return RoleValidation.isRolePolicyValidForCloudDebug(rolePolicy)
    }

    private fun canSimulateCloudDebugActions(
        iamClient: IamClient,
        roleArn: String
    ): Boolean = iamClient.simulatePrincipalPolicy {
        it
            .policySourceArn(roleArn)
            .actionNames(CLOUD_DEBUG_ACTIONS_TO_SIMULATE)
            .build()
    }.evaluationResults().all {
        it.evalDecision() == PolicyEvaluationDecisionType.ALLOWED
    }

    // Auto-select task-role (if it exists in the task-definition). Runs on a background thread.
    private fun attemptSelectRole() =
        try {
            val client: EcsClient = AwsClientManager.getInstance(project).getClient()
            val service = client.describeServices {
                it.cluster(clusterArn)
                it.services(serviceArn)
            }
            val taskDefinition = service.services().first().taskDefinition()
            val taskDefinitionDescription = client.describeTaskDefinition {
                it.taskDefinition(taskDefinition)
            }
            val roleArn = taskDefinitionDescription.taskDefinition().taskRoleArn()
            iamRole.selectedItem {
                it.arn == roleArn
            }
        } catch (e: Exception) {
            LOG.warn(e) { "Unable to retrieve task role for cluster $clusterArn service $serviceArn" }
        }

    override fun dispose() {}

    private companion object {
        val LOG = getLogger<InstrumentDialog>()
        val CLOUD_DEBUG_ACTIONS_TO_SIMULATE = listOf(
            "ssmmessages:CreateControlChannel",
            "ssmmessages:CreateDataChannel",
            "ssmmessages:OpenControlChannel",
            "ssmmessages:OpenDataChannel"
        )
    }
}
