// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.steps

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.core.credentials.toEnvironmentVariables
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.services.lambda.deploy.DeployServerlessApplicationSettings
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.ValidateDocker
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.lambda.upload.FunctionDetails
import software.aws.toolkits.jetbrains.services.lambda.upload.ImageBasedCode
import software.aws.toolkits.jetbrains.services.lambda.upload.ZipBasedCode
import software.aws.toolkits.jetbrains.utils.execution.steps.StepWorkflow
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

fun createLambdaWorkflowForZip(
    project: Project,
    functionDetails: FunctionDetails,
    codeDetails: ZipBasedCode,
    buildDir: Path,
    buildEnvVars: Map<String, String>,
    codeStorageLocation: String,
    samOptions: SamOptions
): StepWorkflow {
    val (dummyTemplate, dummyLogicalId) = createTemporaryZipTemplate(buildDir, codeDetails)
    val packagedTemplate = buildDir.resolve("packaged-temp-template.yaml")
    val builtTemplate = buildDir.resolve("template.yaml")
    val envVars = createAwsEnvVars(project)

    return StepWorkflow(
        buildList {
            if (samOptions.buildInContainer) {
                add(ValidateDocker())
            }

            add(
                BuildLambda(
                    BuildLambdaRequest(
                        templatePath = dummyTemplate,
                        buildDir = buildDir,
                        buildEnvVars = buildEnvVars,
                        samOptions = samOptions
                    )
                ),
            )
            add(
                PackageLambda(
                    templatePath = builtTemplate,
                    packagedTemplatePath = packagedTemplate,
                    logicalId = dummyLogicalId,
                    envVars = envVars,
                    s3Bucket = codeStorageLocation
                ),
            )
            add(
                CreateLambda(
                    lambdaClient = project.awsClient(),
                    details = functionDetails
                )
            )
        }
    )
}

fun createLambdaWorkflowForImage(
    project: Project,
    functionDetails: FunctionDetails,
    codeDetails: ImageBasedCode,
    codeStorageLocation: String,
    samOptions: SamOptions
): StepWorkflow {
    val (dummyTemplate, dummyLogicalId) = createTemporaryImageTemplate(codeDetails)
    val buildDir = codeDetails.dockerfile.resolveSibling(".aws-sam").resolve("build")
    val builtTemplate = buildDir.resolve("template.yaml")
    val packagedTemplate = buildDir.resolve("packaged-temp-template.yaml")
    val envVars = createAwsEnvVars(project)

    return StepWorkflow(
        ValidateDocker(),
        BuildLambda(
            BuildLambdaRequest(
                templatePath = dummyTemplate,
                buildDir = buildDir,
                samOptions = samOptions
            )
        ),
        PackageLambda(
            templatePath = builtTemplate,
            packagedTemplatePath = packagedTemplate,
            logicalId = dummyLogicalId,
            envVars = envVars,
            ecrRepo = codeStorageLocation
        ),
        CreateLambda(project.awsClient(), functionDetails)
    )
}

/**
 * Creates a [StepWorkflow] for updating a Lambda's code and optionally its handler
 *
 * @param updatedHandler If provided, we will call update function configuration with the provided handler.
 */
fun updateLambdaCodeWorkflowForZip(
    project: Project,
    functionName: String,
    codeDetails: ZipBasedCode,
    buildDir: Path,
    buildEnvVars: Map<String, String>,
    codeStorageLocation: String,
    samOptions: SamOptions,
    updatedHandler: String?
): StepWorkflow {
    val (dummyTemplate, dummyLogicalId) = createTemporaryZipTemplate(buildDir, codeDetails)
    val builtTemplate = buildDir.resolve("template.yaml")
    val packagedTemplate = buildDir.resolve("packaged-temp-template.yaml")
    val envVars = createAwsEnvVars(project)

    return StepWorkflow(
        buildList {
            if (samOptions.buildInContainer) {
                add(ValidateDocker())
            }

            add(
                BuildLambda(
                    BuildLambdaRequest(
                        templatePath = dummyTemplate,
                        buildDir = buildDir,
                        buildEnvVars = buildEnvVars,
                        samOptions = samOptions
                    )
                ),
            )
            add(
                PackageLambda(
                    templatePath = builtTemplate,
                    packagedTemplatePath = packagedTemplate,
                    logicalId = dummyLogicalId,
                    envVars = envVars,
                    s3Bucket = codeStorageLocation
                ),
            )
            add(
                UpdateLambdaCode(
                    lambdaClient = project.awsClient(),
                    functionName = functionName,
                    updatedHandler = updatedHandler
                )
            )
        }
    )
}

fun updateLambdaCodeWorkflowForImage(
    project: Project,
    functionName: String,
    codeDetails: ImageBasedCode,
    codeStorageLocation: String,
    samOptions: SamOptions
): StepWorkflow {
    val (dummyTemplate, dummyLogicalId) = createTemporaryImageTemplate(codeDetails)
    val buildDir = codeDetails.dockerfile.resolveSibling(".aws-sam").resolve("build")
    val builtTemplate = buildDir.resolve("template.yaml")
    val packagedTemplate = buildDir.resolve("packaged-temp-template.yaml")
    val envVars = createAwsEnvVars(project)

    return StepWorkflow(
        ValidateDocker(),
        BuildLambda(
            BuildLambdaRequest(
                templatePath = dummyTemplate,
                buildDir = buildDir,
                samOptions = samOptions
            )
        ),
        PackageLambda(
            templatePath = builtTemplate,
            packagedTemplatePath = packagedTemplate,
            logicalId = dummyLogicalId,
            envVars = envVars,
            ecrRepo = codeStorageLocation
        ),
        UpdateLambdaCode(
            lambdaClient = project.awsClient(),
            functionName = functionName,
            updatedHandler = null
        )
    )
}

fun createDeployWorkflow(
    project: Project,
    template: VirtualFile,
    settings: DeployServerlessApplicationSettings
): StepWorkflow {
    val envVars = createAwsEnvVars(project)
    val region = AwsConnectionManager.getInstance(project).activeRegion
    val buildDir = Paths.get(template.parent.path, SamCommon.SAM_BUILD_DIR, "build")
    val builtTemplate = buildDir.resolve("template.yaml")
    val packagedTemplate = builtTemplate.parent.resolve("packaged-${builtTemplate.fileName}")
    val templatePath = Paths.get(template.path)

    Files.createDirectories(buildDir)

    return StepWorkflow(
        buildList {
            if (settings.useContainer) {
                add(ValidateDocker())
            }

            add(
                BuildLambda(
                    BuildLambdaRequest(
                        templatePath = templatePath,
                        logicalId = null,
                        buildDir = buildDir,
                        buildEnvVars = envVars,
                        samOptions = SamOptions(buildInContainer = settings.useContainer)
                    )
                )
            )
            add(
                PackageLambda(
                    templatePath = builtTemplate,
                    packagedTemplatePath = packagedTemplate,
                    logicalId = null,
                    envVars = envVars,
                    s3Bucket = settings.bucket,
                    ecrRepo = settings.ecrRepo
                )
            )
            add(
                DeployLambda(
                    packagedTemplateFile = packagedTemplate,
                    region = region,
                    envVars = envVars,
                    settings = settings
                )
            )
        }
    )
}

private fun createAwsEnvVars(project: Project): Map<String, String> {
    val connectSettings = AwsConnectionManager.getInstance(project).connectionSettings()
        ?: throw IllegalStateException("Tried to update a lambda without valid AWS connection")

    return connectSettings.credentials.resolveCredentials().toEnvironmentVariables() + connectSettings.region.toEnvironmentVariables()
}

private fun createTemporaryZipTemplate(buildDir: Path, codeDetails: ZipBasedCode): Pair<Path, String> {
    Files.createDirectories(buildDir)

    val dummyTemplate = Files.createTempFile("temp-template", ".yaml")
    val dummyLogicalId = "Function"

    SamTemplateUtils.writeDummySamTemplate(
        tempFile = dummyTemplate,
        logicalId = dummyLogicalId,
        runtime = codeDetails.runtime,
        handler = codeDetails.handler,
        codeUri = codeDetails.baseDir.toString()
    )

    return Pair(dummyTemplate, dummyLogicalId)
}

private fun createTemporaryImageTemplate(codeDetails: ImageBasedCode): Pair<Path, String> {
    val dummyTemplate = Files.createTempFile("temp-template", ".yaml")
    val dummyLogicalId = "Function"

    SamTemplateUtils.writeDummySamImageTemplate(
        tempFile = dummyTemplate,
        logicalId = dummyLogicalId,
        dockerfile = codeDetails.dockerfile
    )

    return Pair(dummyTemplate, dummyLogicalId)
}
