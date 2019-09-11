// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution

import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.execution.configurations.RunConfiguration
import com.intellij.execution.configurations.RunConfigurationWithSuppressedDefaultDebugAction
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.runners.RunConfigurationWithSuppressedDefaultRunAction
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.util.xmlb.annotations.Property
import org.jdom.Element
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.ui.connection.AwsConnectionsRunConfigurationBase
import software.aws.toolkits.jetbrains.ui.connection.BaseAwsConnectionOptions
import software.aws.toolkits.resources.message
import java.nio.charset.StandardCharsets

abstract class LambdaRunConfigurationBase<T : BaseLambdaOptions>(
    project: Project,
    private val configFactory: ConfigurationFactory,
    id: String
) : AwsConnectionsRunConfigurationBase<T>(project, configFactory, id),
    RunConfigurationWithSuppressedDefaultRunAction,
    RunConfigurationWithSuppressedDefaultDebugAction {

    @Suppress("UNCHECKED_CAST")
    final override fun clone(): RunConfiguration {
        val element = Element("toClone")
        writeExternal(element)

        val copy = configFactory.createTemplateConfiguration(project) as LambdaRunConfigurationBase<*>
        copy.name = name
        copy.readExternal(element)

        return copy
    }

    fun useInputFile(inputFile: String?) {
        val inputOptions = serializableOptions.inputOptions
        inputOptions.inputIsFile = true
        inputOptions.input = inputFile
    }

    fun useInputText(input: String?) {
        val inputOptions = serializableOptions.inputOptions
        inputOptions.inputIsFile = false
        inputOptions.input = input
    }

    fun isUsingInputFile() = serializableOptions.inputOptions.inputIsFile

    fun inputSource() = serializableOptions.inputOptions.input

    protected fun checkInput() {
        inputSource()?.let {
            if (!isUsingInputFile() || FileUtil.exists(it)) {
                return
            }
        }
        throw RuntimeConfigurationError(message("lambda.run_configuration.no_input_specified"))
    }

    protected fun resolveInput() = inputSource()?.let {
        if (isUsingInputFile() && it.isNotEmpty()) {
            FileDocumentManager.getInstance().saveAllDocuments()
            try {
                LocalFileSystem.getInstance().refreshAndFindFileByPath(it)
                    ?.contentsToByteArray(false)
                    ?.toString(StandardCharsets.UTF_8)
                    ?: throw RuntimeConfigurationError(
                        message(
                            "lambda.run_configuration.input_file_error",
                            it
                        )
                    )
            } catch (e: Exception) {
                throw RuntimeConfigurationError(message("lambda.run_configuration.input_file_error", it))
            }
        } else {
            it
        }
    } ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_input_specified"))

    protected fun resolveCredentials() = credentialProviderId()?.let {
        try {
            CredentialManager.getInstance().getCredentialProvider(it)
        } catch (e: CredentialProviderNotFound) {
            throw RuntimeConfigurationError(message("lambda.run_configuration.credential_not_found_error", it))
        } catch (e: Exception) {
            throw RuntimeConfigurationError(
                message(
                    "lambda.run_configuration.credential_error",
                    e.message ?: "Unknown"
                )
            )
        }
    } ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_credentials_specified"))

    protected fun resolveRegion() = regionId()?.let {
        AwsRegionProvider.getInstance().regions()[it]
    } ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_region_specified"))
}

open class BaseLambdaOptions : BaseAwsConnectionOptions() {
    @get:Property(flat = true) // flat for backwards compat
    var inputOptions = InputOptions()
}

class InputOptions {
    var inputIsFile = false
    var input: String? = null
}
