// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.ValidationInfo
import icons.AwsIcons
import org.intellij.lang.annotations.Language
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.ToolkitClientManager
import software.aws.toolkits.core.s3.regionForBucket
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.iam.CreateIamRoleDialog
import software.aws.toolkits.jetbrains.services.iam.listRolesFilter
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.utils.ui.addAndSelectValue
import software.aws.toolkits.jetbrains.utils.ui.blankAsNull
import software.aws.toolkits.jetbrains.utils.ui.populateValues
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.resources.message
import javax.swing.DefaultComboBoxModel
import javax.swing.JComponent

private const val DEFAULT_TIMEOUT = 60
private const val MAX_TIMEOUT = 300
private const val MIN_TIMEOUT = 1

class UploadToLambdaModal(
    private val project: Project,
    private val runtime: Runtime,
    private val handlerName: String,
    private val validator: UploadToLambdaValidator,
    private val okHandler: (FunctionUploadDetails) -> Unit
) : DialogWrapper(project) {
    private val view = CreateLambdaPanel()

    init {
        super.init()
        title = message("lambda.uploading.title")
    }

    override fun createCenterPanel(): JComponent? {
        val controller =
            UploadToLambdaController(project, view, handlerName, runtime, AwsClientManager.getInstance(project))
        controller.load()
        return view.content
    }

    override fun doValidate(): ValidationInfo? = validator.doValidate(view)

    override fun doOKAction() {
        super.doOKAction()
        okHandler(
            FunctionUploadDetails(
                name = view.name.text!!,
                handler = view.handler.text!!,
                iamRole = view.iamRole.selected()!!,
                s3Bucket = view.sourceBucket.selected()!!,
                runtime = view.runtime.selected()!!,
                description = view.description.text,
                envVars = view.envVars.envVars,
                timeout = view.timeout.text.toInt()
            )
        )
    }
}

class UploadToLambdaValidator {
    fun doValidate(view: CreateLambdaPanel): ValidationInfo? {
        val name = view.name.blankAsNull() ?: return ValidationInfo(
            message("lambda.upload_validation.function_name"),
            view.name
        )
        validateFunctionName(name)?.run { return@doValidate ValidationInfo(this, view.name) }
        view.handler.blankAsNull() ?: return ValidationInfo(message("lambda.upload_validation.handler"), view.handler)
        view.runtime.selected() ?: return ValidationInfo(message("lambda.upload_validation.runtime"), view.runtime)
        view.timeout.text.toIntOrNull().let {
            if (it == null || it < MIN_TIMEOUT || it > MAX_TIMEOUT) {
                return ValidationInfo(
                    message("lambda.upload_validation.timeout", MIN_TIMEOUT, MAX_TIMEOUT),
                    view.timeout
                )
            }
        }
        view.iamRole.selected() ?: return ValidationInfo(message("lambda.upload_validation.iam_role"), view.iamRole)
        view.sourceBucket.selected() ?: return ValidationInfo(
            message("lambda.upload_validation.source_bucket"),
            view.sourceBucket
        )
        return null
    }

    private fun validateFunctionName(name: String): String? {
        if (!FUNCTION_NAME_PATTERN.matches(name)) {
            return message("lambda.upload_validation.function_name_invalid")
        }
        if (name.length > 64) {
            return message("lambda.upload_validation.function_name_too_long", 64)
        }
        return null
    }

    companion object {
        private val FUNCTION_NAME_PATTERN = "[a-zA-Z0-9-_]+".toRegex()
    }
}

class UploadToLambdaController(
    private val project: Project,
    private val view: CreateLambdaPanel,
    private val handlerName: String,
    private val runtime: Runtime,
    clientManager: ToolkitClientManager
) {
    private val s3Client: S3Client = clientManager.getClient()
    private val iamClient: IamClient = clientManager.getClient()

    fun load() {
        view.handler.text = handlerName
        view.iamRole.populateValues {
            iamClient.listRolesFilter { it.assumeRolePolicyDocument().contains(LAMBDA_PRINCIPAL) }
                .map { IamRole(name = it.roleName(), arn = it.arn()) }
                .toList()
        }
        view.sourceBucket.populateValues {
            val activeRegionId = ProjectAccountSettingsManager.getInstance(project).activeRegion.id
            s3Client.listBuckets().buckets()
                .asSequence()
                .filterNotNull()
                .mapNotNull { it.name() }
                .filter { s3Client.regionForBucket(it) == activeRegionId }
                .toList()
        }
        view.runtime.populateValues(selected = runtime) { runtime.runtimeGroup?.runtimes?.toList() ?: emptyList() }

        view.createRole.addActionListener {
            val iamRoleDialog = CreateIamRoleDialog(
                project = project,
                iamClient = iamClient,
                parent = view.content,
                defaultAssumeRolePolicyDocument = DEFAULT_ASSUME_ROLE_POLICY,
                defaultPolicyDocument = DEFAULT_POLICY
            )
            if (iamRoleDialog.showAndGet()) {
                iamRoleDialog.iamRole?.let { iamRole ->
                    runInEdt {
                        val comboBoxModel = view.iamRole.model as DefaultComboBoxModel<IamRole>
                        comboBoxModel.addElement(iamRole)
                        comboBoxModel.selectedItem = iamRole
                    }
                }
            }
        }

        view.createBucket.addActionListener {
            val bucket = Messages.showInputDialog(
                message("lambda.upload.create_s3_dialog.input"),
                message("lambda.upload.create_s3_dialog.title"),
                AwsIcons.Logos.S3_LARGE
            )
            bucket?.run {
                view.sourceBucket.addAndSelectValue {
                    s3Client.createBucket { request -> request.bucket(bucket) }
                    bucket
                }
            }
        }

        view.timeout.text = DEFAULT_TIMEOUT.toString()
    }

    private companion object {
        const val LAMBDA_PRINCIPAL = "lambda.amazonaws.com"

        @Language("JSON")
        val DEFAULT_ASSUME_ROLE_POLICY = """
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
        """.trim()

        @Language("JSON")
        val DEFAULT_POLICY = """
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
        """.trim()
    }
}