// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.steps

import com.intellij.execution.configurations.GeneralCommandLine
import software.aws.toolkits.core.utils.AttributeBagKey
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.lambda.sam.samPackageCommand
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.StepEmitter
import software.aws.toolkits.resources.message
import java.nio.file.Path

class PackageLambda(
    private val templatePath: Path,
    private val packagedTemplatePath: Path,
    private val logicalId: String?,
    private val envVars: Map<String, String>,
    private val s3Bucket: String? = null,
    private val ecrRepo: String? = null
) : SamCliStep() {
    override val stepName: String = message("lambda.create.step.package")

    override fun constructCommandLine(context: Context): GeneralCommandLine = getCli().samPackageCommand(
        templatePath = templatePath,
        packagedTemplatePath = packagedTemplatePath,
        environmentVariables = envVars,
        s3Bucket = s3Bucket,
        ecrRepo = ecrRepo
    )

    override fun handleSuccessResult(output: String, stepEmitter: StepEmitter, context: Context) {
        // We finished the upload, extract out the uploaded code location if we have a logicalId
        logicalId ?: return

        context.putAttribute(UPLOADED_CODE_LOCATION, SamTemplateUtils.getUploadedCodeUri(packagedTemplatePath, logicalId))
    }

    companion object {
        val UPLOADED_CODE_LOCATION = AttributeBagKey.create<UploadedCode>("UPLOADED_CODE_LOCATION")
    }
}
