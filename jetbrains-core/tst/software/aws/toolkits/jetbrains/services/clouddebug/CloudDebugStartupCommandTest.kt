// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import com.intellij.execution.configurations.RuntimeConfigurationError
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Test
import software.aws.toolkits.resources.message

class CloudDebugStartupCommandTest {

    private val startupCommand = CloudDebugStartupCommand(CloudDebuggingPlatform.JVM)

    @Test
    fun emptyStartupCommandThrowsAnException() {
        val containerName = "myContainer"
        assertThatThrownBy { startupCommand.validateStartupCommand("", containerName) }
            .isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(message("cloud_debug.run_configuration.missing.start_command", containerName))
    }

    @Test
    fun nonEmptyStartupCommandIsValidByDefault() {
        startupCommand.validateStartupCommand("java", "myContainer")
    }

    @Test
    fun autoFillIsNotSupportedByDefault() {
        assertThat(startupCommand.isStartCommandAutoFillSupported).isFalse()
    }

    @Test
    fun defaultHintTextIsEmptyString() {
        assertThat(startupCommand.getStartupCommandTextFieldHintText()).isEqualTo("")
    }
}
