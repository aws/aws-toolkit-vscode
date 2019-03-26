// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution

import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.execution.configurations.LocatableConfigurationBase
import com.intellij.execution.configurations.LocatableRunConfigurationOptions
import com.intellij.execution.configurations.RunConfigurationWithSuppressedDefaultDebugAction
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.runners.RunConfigurationWithSuppressedDefaultRunAction
import com.intellij.openapi.components.BaseState
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.util.xmlb.annotations.Property
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.resources.message
import java.nio.charset.StandardCharsets

abstract class LambdaRunConfigurationBase<T : BaseLambdaOptions>(
    project: Project,
    factory: ConfigurationFactory,
    id: String
) : LocatableConfigurationBase<T>(project, factory, id),
    RunConfigurationWithSuppressedDefaultRunAction,
    RunConfigurationWithSuppressedDefaultDebugAction {

    override fun getOptions() = super.getOptions() as BaseLambdaOptions

    fun useInputFile(inputFile: String?) {
        val inputOptions = options.inputOptions
        inputOptions.inputIsFile = true
        inputOptions.input = inputFile
    }

    fun useInputText(input: String?) {
        val inputOptions = options.inputOptions
        inputOptions.inputIsFile = false
        inputOptions.input = input
    }

    fun isUsingInputFile() = options.inputOptions.inputIsFile

    fun inputSource() = options.inputOptions.input

    protected fun resolveInput() = inputSource()?.let {
        if (isUsingInputFile() && inputSource()?.isNotEmpty() == true) {
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

    fun credentialProviderId() = options.accountOptions.credentialProviderId

    fun credentialProviderId(credentialsProviderId: String?) {
        options.accountOptions.credentialProviderId = credentialsProviderId
    }

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

    fun regionId() = options.accountOptions.regionId

    fun regionId(regionId: String?) {
        options.accountOptions.regionId = regionId
    }

    protected fun resolveRegion() = regionId()?.let {
        AwsRegionProvider.getInstance().regions()[it]
    } ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_region_specified"))
}

open class BaseLambdaOptions : LocatableRunConfigurationOptions() {
    @get:Property(flat = true) // flat for backwards compat
    var accountOptions by property(AccountOptions())
    @get:Property(flat = true) // flat for backwards compat
    var inputOptions by property(InputOptions())
}

class AccountOptions : BaseState() {
    var credentialProviderId by property("")
    var regionId by property("")
}

class InputOptions : BaseState() {
    var inputIsFile by property(false)
    var input by string()
}