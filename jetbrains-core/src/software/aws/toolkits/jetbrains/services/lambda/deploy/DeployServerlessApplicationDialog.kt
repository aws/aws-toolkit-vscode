// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.util.text.nullize
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.listBucketsByRegion
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.services.cloudformation.Parameter
import software.aws.toolkits.jetbrains.services.s3.CreateS3BucketDialog
import software.aws.toolkits.jetbrains.utils.ui.addAndSelectValue
import software.aws.toolkits.jetbrains.utils.ui.populateValues
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.resources.message
import javax.swing.JComponent

class DeployServerlessApplicationDialog(
    private val project: Project,
    parameters: Sequence<Parameter>
) : DialogWrapper(project) {
    private val view = DeployServerlessApplicationPanel()
    private val validator = DeploySamApplicationValidator()
    private val s3Client: S3Client = project.awsClient()
    var isNewStack: Boolean = false
        private set

    private val regionProvider = AwsRegionProvider.getInstance()

    init {
        title = message("serverless.application.deploy.title")

        setOKButtonText(message("serverless.application.deploy.action.name"))
        setOKButtonTooltip(message("serverless.application.deploy.action.description"))

        super.init()

        view.withTemplateParameters(parameters.toList())

        view.region.setRegions(regionProvider.regions().values.toList())
        view.createS3BucketButton.isEnabled = view.region.selectedRegion != null

        view.s3Bucket.populateValues {
            emptyList()
        }

        view.stacks.addItem(getStackPlaceholderSelectRegion())
        setNewStackUIVisibility(isNewStack)

        // S3 selector only shows buckets for region of interest
        view.region.addActionListener { _ ->
            view.createS3BucketButton.isEnabled = view.region.selectedRegion != null
            val selectedRegionId = view.region.selectedRegion?.id

            view.s3Bucket.populateValues {
                if (!selectedRegionId.isNullOrEmpty()) {
                    s3Client.listBucketsByRegion(selectedRegionId ?: throw Exception("No region selected"))
                            .mapNotNull { it.name() }
                            .sortedWith(String.CASE_INSENSITIVE_ORDER)
                            .toList()
                } else {
                    emptyList()
                }
            }

            // Show the stacks that exist in this region
            if (view.region.selectedRegion != null) {
                val cloudFormationClient: CloudFormationClient = project.awsClient(view.region.selectedRegion)

                val stacks = ArrayList<String>()
                stacks.add(getStackSelectionTextForCreateStack())

                // Consider adding a horizontal bar into the combo box between the fixed (above) and variable (below) entries

                stacks.addAll(
                        cloudFormationClient.describeStacks().stacks()
                                .asSequence()
                                .mapNotNull { it?.stackName() }
                                .sortedWith(String.CASE_INSENSITIVE_ORDER)
                                .toList()
                )

                view.stacks.populateValues {
                    stacks
                }
            }
        }

        view.stacks.addActionListener {
            isNewStack = view.stacks.selected() == getStackSelectionTextForCreateStack()
            setNewStackUIVisibility(isNewStack)
        }

        view.createS3BucketButton.addActionListener {
            // Ensure bucket creation takes place on the currently selected region
            val selectedRegion = view.region.selectedRegion ?: throw Exception("No region has been selected")
            val currentRegionS3Client: S3Client = project.awsClient(selectedRegion)

            val bucketDialog = CreateS3BucketDialog(
                    project = project,
                    s3Client = currentRegionS3Client,
                    parent = view.content
            )

            if (bucketDialog.showAndGet()) {
                bucketDialog.bucketName().let { newBucket -> view.s3Bucket.addAndSelectValue { newBucket } }
            }
        }
    }

    override fun createCenterPanel(): JComponent? = view.content

    override fun getPreferredFocusedComponent(): JComponent? = view.region

    override fun doValidate(): ValidationInfo? = validator.validateSettings(view)

    val stackName: String
        get() = if (view.stacks.selected() == getStackSelectionTextForCreateStack()) {
            view.newStackName.text.nullize()
        } else {
            view.stacks.selected()
        } ?: throw RuntimeException(message("serverless.application.deploy.validation.stack.missing"))

    val bucket: String
        get() = view.s3Bucket.selected()
                ?: throw RuntimeException(message("serverless.application.deploy.validation.s3.bucket.empty"))

    val region: AwsRegion
        get() = view.region.selectedRegion
                ?: throw RuntimeException(message("serverless.application.deploy.validation.region.empty"))

    val parameters: Map<String, String> = view.templateParameters

    private fun setNewStackUIVisibility(showNewStackControls: Boolean) {
        view.newStackNameLabel.isVisible = showNewStackControls
        view.newStackName.isVisible = showNewStackControls
    }

    companion object {
        fun getStackPlaceholderSelectRegion(): String = message("serverless.application.stack.placeholder.select.region")

        fun getStackSelectionTextForCreateStack(): String = message("serverless.application.stack.selection.create.stack")
    }
}

class DeploySamApplicationValidator {
    fun validateSettings(view: DeployServerlessApplicationPanel): ValidationInfo? {

        // Has the user selected a region
        view.region.selectedRegion ?: return ValidationInfo(
                message("serverless.application.deploy.validation.region.empty"),
                view.region
        )

        // Has the user selected a stack
        val selectedStackName = view.stacks.selected()
                ?: DeployServerlessApplicationDialog.getStackPlaceholderSelectRegion()
        if (selectedStackName == DeployServerlessApplicationDialog.getStackPlaceholderSelectRegion()) {
            return ValidationInfo(
                    message("serverless.application.deploy.validation.stack.missing"),
                    view.stacks
            )
        } else if (selectedStackName == DeployServerlessApplicationDialog.getStackSelectionTextForCreateStack()) {
            if (view.newStackName.text.isNullOrEmpty()) {
                return ValidationInfo(
                        message("serverless.application.deploy.validation.new.stack.name.missing"),
                        view.newStackName
                )
            }

            // Validate stack name
            validateStackName(view.newStackName.text)?.let {
                return ValidationInfo(it, view.newStackName)
            }
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

    private fun validateStackName(name: String): String? {
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