// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.execution

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.configurations.RunConfigurationBase
import com.intellij.execution.target.TargetedCommandLineBuilder
import com.intellij.execution.target.value.TargetEnvironmentFunction
import com.intellij.execution.target.value.constant
import com.intellij.openapi.util.Key
import com.intellij.util.xmlb.XmlSerializer
import org.jdom.Element
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.credentials.mergeWithExistingEnvironmentVariables
import software.aws.toolkits.core.credentials.toEnvironmentVariables
import software.aws.toolkits.core.region.mergeWithExistingEnvironmentVariables
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.execution.AwsCredentialInjectionOptions.Companion.DEFAULT_OPTIONS
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AwsTelemetry
import software.aws.toolkits.telemetry.Result.Failed
import software.aws.toolkits.telemetry.Result.Succeeded

class AwsConnectionRunConfigurationExtension<T : RunConfigurationBase<*>> {
    fun addToTargetEnvironment(configuration: T, environment: MutableMap<String, TargetEnvironmentFunction<String>>, runtimeString: () -> String? = { null }) {
        injectCredentials(configuration, runtimeString) { settings ->
            val putFn = { map: Map<String, String> ->
                map.forEach { (k, v) -> environment[k] = constant(v) }
            }

            settings.region.mergeWithExistingEnvironmentVariables(environment.keys, putFn)
            settings.credentials.resolveCredentials().mergeWithExistingEnvironmentVariables(environment.keys, environment::remove, putFn)
        }
    }

    fun addEnvironmentVariables(configuration: T, environment: MutableMap<String, String>, runtimeString: () -> String? = { null }) {
        injectCredentials(configuration, runtimeString) {
            it.region.mergeWithExistingEnvironmentVariables(environment)
            it.credentials.resolveCredentials().mergeWithExistingEnvironmentVariables(environment)
        }
    }

    fun addToTargetCommandLineBuilder(configuration: T, cmdLine: TargetedCommandLineBuilder, runtimeString: () -> String? = { null }) {
        injectCredentials(configuration, runtimeString) {
            it.credentials.resolveCredentials().toEnvironmentVariables().forEach { key, value -> cmdLine.addEnvironmentVariable(key, value) }
            it.region.toEnvironmentVariables().forEach { key, value -> cmdLine.addEnvironmentVariable(key, value) }
        }
    }

    private fun injectCredentials(configuration: T, runtimeString: () -> String?, environmentMutator: (ConnectionSettings) -> Unit) {
        try {
            val credentialConfiguration = credentialConfiguration(configuration) ?: return
            if (credentialConfiguration == DEFAULT_OPTIONS) return

            val connection = getConnection(configuration, credentialConfiguration)
            environmentMutator(connection)
            AwsTelemetry.injectCredentials(configuration.project, result = Succeeded, runtimeString = tryOrNull { runtimeString() })
        } catch (e: Exception) {
            AwsTelemetry.injectCredentials(configuration.project, result = Failed, runtimeString = tryOrNull { runtimeString() })
            LOG.error(e) { message("run_configuration_extension.inject_aws_connection_exception") }
        }
    }

    fun validateConfiguration(runConfiguration: T) {
        val credentialConfiguration = runConfiguration.getCopyableUserData(AWS_CONNECTION_RUN_CONFIGURATION_KEY) ?: return
        if (credentialConfiguration == DEFAULT_OPTIONS) return

        getConnection(runConfiguration, credentialConfiguration)
    }

    fun readExternal(runConfiguration: T, element: Element) {
        runConfiguration.putCopyableUserData(
            AWS_CONNECTION_RUN_CONFIGURATION_KEY,
            XmlSerializer.deserialize(
                element,
                AwsCredentialInjectionOptions::class.java
            )
        )
    }

    fun writeExternal(runConfiguration: T, element: Element) {
        runConfiguration.getCopyableUserData(AWS_CONNECTION_RUN_CONFIGURATION_KEY)?.let {
            XmlSerializer.serializeInto(it, element)
        }
    }

    private fun credentialConfiguration(configuration: T) = configuration.getCopyableUserData(AWS_CONNECTION_RUN_CONFIGURATION_KEY)

    private fun getConnection(configuration: T, credentialConfiguration: AwsCredentialInjectionOptions): ConnectionSettings {
        val regionProvider = AwsRegionProvider.getInstance()
        val credentialManager = CredentialManager.getInstance()

        return if (credentialConfiguration.useCurrentConnection) {
            AwsConnectionManager.getInstance(configuration.project).connectionSettings() ?: throw RuntimeException(message("configure.toolkit"))
        } else {
            val region = credentialConfiguration.region?.let {
                regionProvider.allRegions()[it]
            } ?: throw IllegalStateException(message("configure.validate.no_region_specified"))

            val credentialProviderId = credentialConfiguration.credential ?: throw IllegalStateException(message("aws.notification.credentials_missing"))

            val credentialProvider = credentialManager.getCredentialIdentifierById(credentialProviderId)?.let {
                credentialManager.getAwsCredentialProvider(it, region)
            } ?: throw RuntimeException(message("aws.notification.credentials_missing"))

            ConnectionSettings(credentialProvider, region)
        }
    }

    private companion object {
        val LOG = getLogger<AwsConnectionRunConfigurationExtension<*>>()
    }
}

fun <T : RunConfigurationBase<*>> AwsConnectionRunConfigurationExtension<T>.addEnvironmentVariables(
    configuration: T,
    cmdLine: GeneralCommandLine,
    runtimeString: () -> String? = { null }
) = addEnvironmentVariables(configuration, cmdLine.environment, runtimeString)

fun <T : RunConfigurationBase<*>> connectionSettingsEditor(configuration: T): AwsConnectionExtensionSettingsEditor<T> =
    configuration.getProject().let { AwsConnectionExtensionSettingsEditor(it, false) }

val AWS_CONNECTION_RUN_CONFIGURATION_KEY =
    Key.create<AwsCredentialInjectionOptions>(
        "aws.toolkit.runConfigurationConnection"
    )

data class AwsCredentialInjectionOptions(
    var useCurrentConnection: Boolean = false,
    var region: String? = null,
    var credential: String? = null
) {
    companion object {
        operator fun invoke(block: AwsCredentialInjectionOptions.() -> Unit) = AwsCredentialInjectionOptions().apply(block)
        val DEFAULT_OPTIONS by lazy { AwsCredentialInjectionOptions() }
    }
}
