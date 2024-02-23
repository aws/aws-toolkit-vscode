// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.util.SystemInfo
import com.intellij.util.text.SemVer
import software.aws.toolkits.core.lambda.LambdaArchitecture
import software.aws.toolkits.jetbrains.core.executables.AutoResolvable
import software.aws.toolkits.jetbrains.core.executables.ExecutableCommon
import software.aws.toolkits.jetbrains.core.executables.ExecutableType
import software.aws.toolkits.jetbrains.core.executables.Validatable
import software.aws.toolkits.jetbrains.services.lambda.deploy.DeployServerlessApplicationSettings
import software.aws.toolkits.jetbrains.services.lambda.sam.sync.SyncServerlessApplicationSettings
import software.aws.toolkits.jetbrains.services.lambda.wizard.AppBasedImageTemplate
import software.aws.toolkits.jetbrains.services.lambda.wizard.AppBasedZipTemplate
import software.aws.toolkits.jetbrains.services.lambda.wizard.LocationBasedTemplate
import software.aws.toolkits.jetbrains.services.lambda.wizard.TemplateParameters
import software.aws.toolkits.jetbrains.settings.ExecutableDetector
import java.nio.file.Path
import java.nio.file.Paths

class SamExecutable : ExecutableType<SemVer>, AutoResolvable, Validatable {
    companion object {
        // inclusive
        val minVersion = SemVer("1.0.0", 1, 0, 0)

        // exclusive
        val maxVersion = SemVer("2.0.0", 2, 0, 0)

        /**
         * The text SAM cli prints after the user code finishes running and
         * the debugger is disconnected.
         */
        const val endDebuggingText = "END RequestId: "

        // Reliable start message printed when delve starts
        // Comes from: https://github.com/go-delve/delve/blob/f5d2e132bca763d222680815ace98601c2396517/service/debugger/debugger.go#L187
        const val goStartMessage = "launching process with args"
    }

    override val displayName: String = "sam"
    override val id: String = "samCli"

    override fun version(path: Path): SemVer = ExecutableCommon.getVersion(
        path.toString(),
        SamVersionCache,
        this.displayName
    )

    override fun validate(path: Path) {
        val version = this.version(path)
        ExecutableCommon.checkSemVerVersion(
            version,
            minVersion,
            maxVersion,
            this.displayName
        )
    }

    override fun resolve(): Path? {
        val path = (
            if (SystemInfo.isWindows) {
                ExecutableDetector().find(
                    arrayOf("C:\\Program Files\\Amazon\\AWSSAMCLI\\bin", "C:\\Program Files (x86)\\Amazon\\AWSSAMCLI\\bin"),
                    arrayOf("sam.cmd", "sam.exe")
                )
            } else {
                ExecutableDetector().find(
                    arrayOf("/usr/local/bin", "/usr/bin"),
                    arrayOf("sam")
                )
            }
            ) ?: return null

        return Paths.get(path)
    }
}

fun GeneralCommandLine.samBuildCommand(
    templatePath: Path,
    logicalId: String? = null,
    buildDir: Path,
    environmentVariables: Map<String, String>,
    samOptions: SamOptions
) = this.apply {
    withEnvironment(environmentVariables)
    withWorkDirectory(templatePath.toAbsolutePath().parent.toString())

    addParameter("build")

    // Add logical id if known to perform min build
    logicalId?.let {
        withParameters(logicalId)
    }

    addParameter("--template")
    addParameter(templatePath.toString())
    addParameter("--build-dir")
    addParameter(buildDir.toString())
    if (samOptions.buildInContainer) {
        withParameters("--use-container")
    }

    if (samOptions.skipImagePull) {
        withParameters("--skip-pull-image")
    }

    samOptions.dockerNetwork?.let { network ->
        val sanitizedNetwork = network.trim()
        if (sanitizedNetwork.isNotBlank()) {
            withParameters("--docker-network").withParameters(sanitizedNetwork)
        }
    }

    samOptions.additionalBuildArgs?.let { buildArgs ->
        if (buildArgs.isNotBlank()) {
            withParameters(*buildArgs.split(" ").toTypedArray())
        }
    }
}

fun GeneralCommandLine.samPackageCommand(
    environmentVariables: Map<String, String>,
    templatePath: Path,
    packagedTemplatePath: Path,
    s3Bucket: String?,
    ecrRepo: String?
) = this.apply {
    withEnvironment(environmentVariables)
    withWorkDirectory(templatePath.parent.toAbsolutePath().toString())

    addParameter("package")
    addParameter("--template-file")
    addParameter(templatePath.toString())
    addParameter("--output-template-file")
    addParameter(packagedTemplatePath.toString())
    s3Bucket?.let {
        addParameter("--s3-bucket")
        addParameter(s3Bucket)
    }
    ecrRepo?.let {
        addParameter("--image-repository")
        addParameter(ecrRepo)
    }
}

fun GeneralCommandLine.samDeployCommand(
    environmentVariables: Map<String, String>,
    templatePath: Path,
    settings: DeployServerlessApplicationSettings
) = this.apply {
    withEnvironment(environmentVariables)
    withWorkDirectory(templatePath.parent.toAbsolutePath().toString())

    addParameter("deploy")
    addParameter("--template-file")
    addParameter(templatePath.toString())
    addParameter("--stack-name")
    addParameter(settings.stackName)
    addParameter("--s3-bucket")
    addParameter(settings.bucket)
    settings.ecrRepo?.let {
        addParameter("--image-repository")
        addParameter(it)
    }

    if (settings.capabilities.isNotEmpty()) {
        addParameter("--capabilities")
        addParameters(settings.capabilities.map { it.capability })
    }

    addParameter("--no-execute-changeset")

    if (settings.parameters.isNotEmpty()) {
        addParameter("--parameter-overrides")
        // Even though keys must be alphanumeric, escape it so that it is "valid" enough so that CFN can return a validation error instead of us failing
        settings.parameters.forEach { (key, value) ->
            addParameter(
                "${escapeParameter(key)}=${escapeParameter(value)}"
            )
        }
    }

    if (settings.tags.isNotEmpty()) {
        addParameter("--tags")
        // Even though keys must be alphanumeric, escape it so that it is "valid" enough so that CFN can return a validation error instead of us failing
        settings.tags.forEach { (key, value) ->
            addParameter(
                "${escapeParameter(key)}=${escapeParameter(value)}"
            )
        }
    }
}

private fun escapeParameter(param: String): String {
    // Invert the quote if the string is already quoted
    val quote = if (param.startsWith("\"") || param.endsWith("\"")) {
        "'"
    } else {
        "\""
    }

    return quote + param + quote
}

fun GeneralCommandLine.samInitCommand(
    outputDir: Path,
    parameters: TemplateParameters,
    extraContext: Map<String, String>
) = this.apply {
    addParameter("init")
    addParameter("--no-input")
    addParameter("--output-dir")
    addParameter(outputDir.toAbsolutePath().toString())

    when (parameters) {
        is AppBasedZipTemplate -> {
            addParameter("--name")
            addParameter(parameters.name)
            addParameter("--runtime")
            addParameter(parameters.runtime.toString())
            if (parameters.architecture != LambdaArchitecture.DEFAULT) {
                addParameter("--architecture")
                addParameter(parameters.architecture.toString())
            }
            addParameter("--dependency-manager")
            addParameter(parameters.dependencyManager)
            addParameter("--app-template")
            addParameter(parameters.appTemplate)
        }
        is AppBasedImageTemplate -> {
            addParameter("--package-type")
            addParameter("Image")
            addParameter("--name")
            addParameter(parameters.name)
            addParameter("--base-image")
            addParameter(parameters.baseImage)
            if (parameters.architecture != LambdaArchitecture.DEFAULT) {
                addParameter("--architecture")
                addParameter(parameters.architecture.toString())
            }
            addParameter("--dependency-manager")
            addParameter(parameters.dependencyManager)
            addParameter("--app-template")
            addParameter(parameters.appTemplate)
        }
        is LocationBasedTemplate -> {
            addParameter("--location")
            addParameter(parameters.location)
        }
    }

    if (extraContext.isNotEmpty()) {
        val extraContextAsJson = jacksonObjectMapper().writeValueAsString(extraContext)

        addParameter("--extra-context")
        addParameter(extraContextAsJson)
    }
}

fun GeneralCommandLine.samSyncCommand(
    environmentVariables: Map<String, String>,
    templatePath: Path,
    settings: SyncServerlessApplicationSettings
) = this.apply {
    withEnvironment(environmentVariables)
    withWorkDirectory(templatePath.toAbsolutePath().parent.toString())
    addParameter("sync")
    addParameter("--stack-name")
    addParameter(settings.stackName)
    addParameter("--template-file")
    addParameter(templatePath.toString())
    addParameter("--s3-bucket")
    addParameter(settings.bucket)
    settings.ecrRepo?.let {
        addParameter("--image-repository")
        addParameter(it)
    }
    if (settings.capabilities.isNotEmpty()) {
        addParameter("--capabilities")
        addParameters(settings.capabilities.map { it.capability })
    }
    if (settings.parameters.isNotEmpty()) {
        addParameter("--parameter-overrides")
        settings.parameters.forEach { (key, value) ->
            addParameter(
                "${escapeParameter(key)}=${escapeParameter(value)}"
            )
        }
    }

    if (settings.tags.isNotEmpty()) {
        addParameter("--tags")
        settings.tags.forEach { (key, value) ->
            addParameter(
                "${escapeParameter(key)}=${escapeParameter(value)}"
            )
        }
    }
    if (settings.useContainer) {
        addParameter("--use-container")
    }
    addParameter("--no-dependency-layer")

    addParameter("--no-watch")
}
