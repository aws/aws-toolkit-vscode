// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy

import com.intellij.openapi.module.ModuleUtilCore.findModuleForFile
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.text.nullize
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.utils.listBucketsByRegion
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.cloudformation.listStackSummariesFilter
import software.aws.toolkits.jetbrains.services.s3.CreateS3BucketDialog
import software.aws.toolkits.jetbrains.settings.DeploySettings
import software.aws.toolkits.jetbrains.settings.relativeSamPath
import software.aws.toolkits.jetbrains.utils.ui.addAndSelectValue
import software.aws.toolkits.jetbrains.utils.ui.populateValues
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.resources.message
import javax.swing.JComponent

class DeployServerlessApplicationDialog(
    private val project: Project,
    private val templateFile: VirtualFile
) : DialogWrapper(project) {

    private val module = findModuleForFile(templateFile, project)
    private val settings: DeploySettings? = module?.let { DeploySettings.getInstance(it) }
    private val samPath: String = module?.let { relativeSamPath(it, templateFile) } ?: templateFile.name

    private val view = DeployServerlessApplicationPanel()
    private val validator = DeploySamApplicationValidator()
    private val s3Client: S3Client = project.awsClient()
    private val cloudFormationClient: CloudFormationClient = project.awsClient()

    init {
        super.init()

        title = message("serverless.application.deploy.title")
        setOKButtonText(message("serverless.application.deploy.action.name"))
        setOKButtonTooltip(message("serverless.application.deploy.action.description"))

        view.createStack.addActionListener {
            view.newStackName.isEnabled = true
            view.stacks.isEnabled = false
        }

        view.updateStack.addActionListener {
            view.newStackName.isEnabled = false
            view.stacks.isEnabled = true
        }

        // If the module has been deployed once, select the updateStack radio instead
        if (settings?.samStackName(samPath) != null) {
            view.updateStack.isSelected = true
            view.newStackName.isEnabled = false
            view.stacks.isEnabled = true
        }

        view.stacks.populateValues(default = settings?.samStackName(samPath), updateStatus = false) {
            cloudFormationClient.listStackSummariesFilter { it.stackStatus() != StackStatus.DELETE_COMPLETE }
                    .mapNotNull { it.stackName() }
                    .sortedWith(String.CASE_INSENSITIVE_ORDER)
                    .toList()
        }

        view.withTemplateParameters(CloudFormationTemplate.parse(project, templateFile).parameters().toList())

        view.s3Bucket.populateValues(default = settings?.samBucketName(samPath)) {
            val activeRegionId = ProjectAccountSettingsManager.getInstance(project).activeRegion.id
            s3Client.listBucketsByRegion(activeRegionId)
                    .mapNotNull { it.name() }
                    .sortedWith(String.CASE_INSENSITIVE_ORDER)
                    .toList()
        }

        view.createS3BucketButton.addActionListener {
            val bucketDialog = CreateS3BucketDialog(
                    project = project,
                    s3Client = s3Client,
                    parent = view.content
            )

            if (bucketDialog.showAndGet()) {
                bucketDialog.bucketName().let { newBucket -> view.s3Bucket.addAndSelectValue { newBucket } }
            }
        }

        view.requireReview.isSelected = !(settings?.samAutoExecute(samPath) ?: true)
    }

    override fun createCenterPanel(): JComponent? = view.content

    override fun getPreferredFocusedComponent(): JComponent? =
            if (settings?.samStackName(samPath) == null) view.newStackName else view.updateStack

    override fun doValidate(): ValidationInfo? = validator.validateSettings(view)

    val stackName: String
        get() = if (view.createStack.isSelected) {
            view.newStackName.text.nullize()
        } else {
            view.stacks.selected()
        } ?: throw RuntimeException(message("serverless.application.deploy.validation.stack.missing"))

    val bucket: String
        get() = view.s3Bucket.selected()
                ?: throw RuntimeException(message("serverless.application.deploy.validation.s3.bucket.empty"))

    val autoExecute: Boolean
        get() = !view.requireReview.isSelected

    val parameters: Map<String, String> = view.templateParameters
}

class DeploySamApplicationValidator {

    fun validateSettings(view: DeployServerlessApplicationPanel): ValidationInfo? {
        if (view.createStack.isSelected) {
            validateStackName(view.newStackName.text)?.let {
                return ValidationInfo(it, view.newStackName)
            }
        } else if (view.updateStack.isSelected && view.stacks.selected() == null) {
            return ValidationInfo(message("serverless.application.deploy.validation.stack.missing"), view.stacks)
        }

        // Are any Template Parameters missing
        validateParameters(view)?.let {
            return it
        }

        // Has the user selected a bucket
        view.s3Bucket.selected() ?: return ValidationInfo(
                message("serverless.application.deploy.validation.s3.bucket.empty"),
                view.s3Bucket
        )

        return null
    }

    private fun validateParameters(view: DeployServerlessApplicationPanel): ValidationInfo? {
        val parameters = view.templateParameters

        val unsetParameters = parameters.entries
                .filter { it.value.isNullOrBlank() }
                .map { it.key }
                .toList()

        if (unsetParameters.any()) {
            return ValidationInfo(
                    message("serverless.application.deploy.validation.template.values.missing", unsetParameters.joinToString(", ")),
                    view.templateEditorComponent
            )
        }

        return null
    }

    private fun validateStackName(name: String?): String? {
        if (name == null || name.isEmpty()) {
            return message("serverless.application.deploy.validation.new.stack.name.missing")
        }
        if (!STACK_NAME_PATTERN.matches(name)) {
            return message("serverless.application.deploy.validation.new.stack.name.invalid")
        }
        if (name.length > MAX_STACK_NAME_LENGTH) {
            return message("serverless.application.deploy.validation.new.stack.name.too.long", MAX_STACK_NAME_LENGTH)
        }
        return null
    }

    companion object {
        // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-using-console-create-stack-parameters.html
        //  A stack name can contain only alphanumeric characters (case-sensitive) and hyphens. It must start with an alphabetic character and can't be longer than 128 characters.
        private val STACK_NAME_PATTERN = "[a-zA-Z][a-zA-Z0-9-]*".toRegex()
        const val MAX_STACK_NAME_LENGTH = 128
    }
}