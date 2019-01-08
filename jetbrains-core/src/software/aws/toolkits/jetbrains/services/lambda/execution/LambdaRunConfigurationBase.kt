// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution

import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.execution.configurations.LocatableConfigurationBase
import com.intellij.execution.configurations.RunConfiguration
import com.intellij.execution.configurations.RunConfigurationWithSuppressedDefaultDebugAction
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.runners.RunConfigurationWithSuppressedDefaultRunAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.util.xmlb.XmlSerializer
import com.intellij.util.xmlb.XmlSerializerUtil
import org.jdom.Element
import software.aws.toolkits.resources.message
import java.nio.charset.StandardCharsets

abstract class LambdaRunConfigurationBase<T : LambdaRunConfigurationBase.MutableLambdaRunSettings>(
    project: Project,
    factory: ConfigurationFactory,
    id: String
) : LocatableConfigurationBase<T>(project, factory, id),
    RunConfigurationWithSuppressedDefaultRunAction,
    RunConfigurationWithSuppressedDefaultDebugAction {

    internal abstract var settings: T

    final override fun writeExternal(element: Element) {
        super.writeExternal(element)
        XmlSerializer.serializeInto(settings, element)
    }

    final override fun readExternal(element: Element) {
        super.readExternal(element)
        XmlSerializer.deserializeInto(settings, element)
    }

    @Suppress("UNCHECKED_CAST")
    final override fun clone(): RunConfiguration {
        val copy = super.clone() as LambdaRunConfigurationBase<T>
        copy.settings = XmlSerializerUtil.createCopy(settings)
        return copy
    }

    abstract class MutableLambdaRunSettings(
        var input: String?,
        var inputIsFile: Boolean
    ) {
        protected fun resolveInputText(input: String?, inputIsFile: Boolean): String = if (inputIsFile && input?.isNotEmpty() == true) {
            try {
                LocalFileSystem.getInstance()
                    .refreshAndFindFileByPath(input)
                    ?.contentsToByteArray(false)
                    ?.toString(StandardCharsets.UTF_8)
                        ?: throw RuntimeConfigurationError(
                            message(
                                "lambda.run_configuration.input_file_error",
                                input
                            )
                        )
            } catch (e: Exception) {
                throw RuntimeConfigurationError(message("lambda.run_configuration.input_file_error", input))
            }
        } else {
            input ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_input_specified"))
        }
    }
}