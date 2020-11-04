// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload.steps

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.toEnvironmentVariables
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.lambda.upload.CodeDetails
import software.aws.toolkits.jetbrains.services.lambda.upload.FunctionDetails
import software.aws.toolkits.jetbrains.utils.execution.steps.StepWorkflow
import java.nio.file.Files
import java.nio.file.Path

fun createLambdaWorkflow(
    project: Project,
    codeDetails: CodeDetails,
    buildDir: Path,
    buildEnvVars: Map<String, String>,
    codeStorageLocation: String,
    samOptions: SamOptions,
    functionDetails: FunctionDetails
): StepWorkflow {
    val (dummyTemplate, dummyLogicalId) = createTemporaryTemplate(buildDir, codeDetails)
    val packagedTemplate = buildDir.resolve("packaged-temp-template.yaml")
    val envVars = createAwsEnvVars(project)

    return StepWorkflow(
        BuildLambda(dummyTemplate, buildDir, buildEnvVars, samOptions),
        PackageLambda(dummyTemplate, packagedTemplate, dummyLogicalId, codeStorageLocation, envVars),
        CreateLambda(project.awsClient(), functionDetails)
    )
}

/**
 * Creates a [StepWorkflow] for updating a Lambda's code and optionally its handler
 *
 * @param updatedFunctionDetails If provided, we will call update function configuration with the provided values.
 * This enables changing a handler at the same time. TODO: Can we build a better way that only has us passing handler?
 */
fun updateLambdaCodeWorkflow(
    project: Project,
    functionName: String,
    codeDetails: CodeDetails,
    buildDir: Path,
    buildEnvVars: Map<String, String>,
    codeStorageLocation: String,
    samOptions: SamOptions,
    updatedFunctionDetails: FunctionDetails?
): StepWorkflow {
    val (dummyTemplate, dummyLogicalId) = createTemporaryTemplate(buildDir, codeDetails)
    val packagedTemplate = buildDir.resolve("packaged-temp-template.yaml")
    val envVars = createAwsEnvVars(project)

    return StepWorkflow(
        BuildLambda(dummyTemplate, buildDir, buildEnvVars, samOptions),
        PackageLambda(dummyTemplate, packagedTemplate, dummyLogicalId, codeStorageLocation, envVars),
        UpdateLambdaCode(project.awsClient(), functionName, updatedFunctionDetails)
    )
}

private fun createAwsEnvVars(project: Project): Map<String, String> {
    val connectSettings = AwsConnectionManager.getInstance(project).connectionSettings()
        ?: throw IllegalStateException("Tried to update a lambda without valid AWS connection")

    return connectSettings.credentials.resolveCredentials().toEnvironmentVariables() + connectSettings.region.toEnvironmentVariables()
}

private fun createTemporaryTemplate(buildDir: Path, codeDetails: CodeDetails): Pair<Path, String> {
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
