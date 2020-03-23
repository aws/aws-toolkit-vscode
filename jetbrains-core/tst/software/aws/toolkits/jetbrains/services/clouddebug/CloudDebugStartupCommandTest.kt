// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import com.intellij.execution.configurations.RuntimeConfigurationError
import org.assertj.core.api.Assertions
import org.junit.Test
import software.aws.toolkits.resources.message

class CloudDebugStartupCommandTest {

    private val startupCommand = CloudDebugStartupCommand(CloudDebuggingPlatform.JVM)

    @Test
    fun emptyStartupCommandThrowsAnException() {
        val containerName = "myContainer"
        Assertions.assertThatThrownBy { startupCommand.validateStartupCommand("", containerName) }
            .isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(message("cloud_debug.run_configuration.missing.start_command", containerName))
    }

    @Test
    fun nonEmptyStartupCommandIsValidByDefault() {
        startupCommand.validateStartupCommand("java", "myContainer")
    }

    @Test
    fun autoFillIsNotSupportedByDefault() {
        Assertions.assertThat(startupCommand.isStartCommandAutoFillSupported).isFalse()
    }

    @Test
    fun defaultHintTextIsEmptyString() {
        Assertions.assertThat(startupCommand.getStartupCommandTextFieldHintText()).isEqualTo("")
    }
}
