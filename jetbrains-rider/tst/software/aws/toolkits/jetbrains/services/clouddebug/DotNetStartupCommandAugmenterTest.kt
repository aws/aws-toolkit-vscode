// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import base.AwsReuseSolutionTestBase
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.configurations.RuntimeConfigurationException
import com.intellij.openapi.util.registry.Registry
import com.intellij.util.execution.ParametersListUtil
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.testng.annotations.AfterMethod
import org.testng.annotations.BeforeMethod
import org.testng.annotations.Test
import software.aws.toolkits.resources.message

class DotNetStartupCommandAugmenterTest : AwsReuseSolutionTestBase() {

    override fun getSolutionDirectoryName() = "SamHelloWorldApp"

    companion object {
        private const val DEFAULT_STARTUP_COMMAND = "dotnet /prog/netcoreapp2.1/ConsoleApp.dll"
    }

    var useNetCoreDebuggerOriginal: Boolean = true

    @BeforeMethod(alwaysRun = true)
    fun setRegistry() {
        useNetCoreDebuggerOriginal = Registry.get(DotNetDebuggerSupport.USE_DOTNET_CORE_RUNTIME_FLAG_NAME).asBoolean()
    }

    @AfterMethod(alwaysRun = true)
    fun resetRegistry() {
        Registry.get(DotNetDebuggerSupport.USE_DOTNET_CORE_RUNTIME_FLAG_NAME).setValue(useNetCoreDebuggerOriginal)
    }

    @Test
    fun testAugmentStatement_NoDebugPort_Exception() {
        assertThatThrownBy { DotNetDebuggerSupport().augmentStatement(DEFAULT_STARTUP_COMMAND, listOf(), "") }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage(message("cloud_debug.step.augment_statement.missing_debug_port"))
    }

    @Test
    fun testAugmentStatement_SingleDebugPort_Exception() {
        assertThatThrownBy { DotNetDebuggerSupport().augmentStatement(DEFAULT_STARTUP_COMMAND, listOf(123), "") }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage(message("cloud_debug.step.dotnet.two_ports_required"))
    }

    @Test
    fun testAugmentStatement_MonoRuntime() {
        Registry.get(DotNetDebuggerSupport.USE_DOTNET_CORE_RUNTIME_FLAG_NAME).setValue(false)

        val pathToDebugger = "/path/to/debugger"
        val statement = DotNetDebuggerSupport().augmentStatement(DEFAULT_STARTUP_COMMAND, listOf(123, 456), pathToDebugger)
        val expectedCommand =
            ParametersListUtil.join(
                "/aws/cloud-debug/common/busybox",
                "sh",
                "-c",
                ParametersListUtil.join(
                    "/aws/cloud-debug/common/busybox",
                    "chmod",
                    "+x",
                    "/aws/DOTNET/aws_rider_debugger_files/runtime.sh",
                    "/aws/DOTNET/aws_rider_debugger_files/linux-x64/mono/bin/mono-sgen",
                    "&&",
                    "env",
                    "REMOTE_DEBUG_PORT=123",
                    "RESHARPER_HOST_LOG_DIR=/aws/DOTNET/aws_rider_debugger_files/Logs",
                    "/aws/DOTNET/aws_rider_debugger_files/runtime.sh",
                    pathToDebugger,
                    "--mode=server",
                    "--frontend-port=123",
                    "--backend-port=456"
                )
            )
        assertThat(statement).isEqualTo(expectedCommand)
    }

    @Test
    fun testAugmentStatement_DotNetCoreRuntime() {
        Registry.get(DotNetDebuggerSupport.USE_DOTNET_CORE_RUNTIME_FLAG_NAME).setValue(true)

        val pathToDebugger = "/path/to/debugger"
        val statement = DotNetDebuggerSupport().augmentStatement(DEFAULT_STARTUP_COMMAND, listOf(123, 456), pathToDebugger)
        val expectedCommand =
            ParametersListUtil.join(
                "env",
                "REMOTE_DEBUG_PORT=123",
                "RESHARPER_HOST_LOG_DIR=/aws/DOTNET/aws_rider_debugger_files/Logs",
                "dotnet",
                pathToDebugger,
                "--mode=server",
                "--frontend-port=123",
                "--backend-port=456"
            )
        assertThat(statement).isEqualTo(expectedCommand)
    }

    @Test
    fun testAutomaticallyAugmentable_NoDotnetInCommand_Exception() {
        val statement = "java /prog/netcoreapp2.1/ConsoleApp.dll"
        assertThatThrownBy { DotNetDebuggerSupport().automaticallyAugmentable(input = statement) }
            .isInstanceOf(RuntimeConfigurationException::class.java)
            .hasMessage(message("cloud_debug.run_configuration.dotnet.start_command.miss_runtime", "dotnet"))
    }

    @Test
    fun testAutomaticallyAugmentable_LeadingSingleQuote_Exception() {
        val statement = "'/path/to/dotnet' /prog/netcoreapp2.1/ConsoleApp.dll"
        assertThatThrownBy { DotNetDebuggerSupport().automaticallyAugmentable(input = statement) }
            .isInstanceOf(RuntimeConfigurationException::class.java)
            .hasMessage(message("cloud_debug.run_configuration.augment.single_quote"))
    }

    @Test
    fun testAutomaticallyAugmentable_ValidCommand() {
        val statement = "dotnet /prog/netcoreapp2.1/ConsoleApp.dll"
        val isAugmented = DotNetDebuggerSupport().automaticallyAugmentable(input = statement)
        assertThat(isAugmented).isTrue()
    }

    @Test
    fun testAutomaticallyAugmentable_SingleCommand() {
        val statement = "dotnet"
        val isAugmented = DotNetDebuggerSupport().automaticallyAugmentable(input = statement)
        assertThat(isAugmented).isFalse()
    }

    @Test
    fun testAutomaticallyAugmentable_InvalidPath() {
        val statement = "dotnet invalid_path"
        assertThatThrownBy { DotNetDebuggerSupport().automaticallyAugmentable(input = statement) }
            .isInstanceOf(RuntimeConfigurationError::class.java)
            .hasMessage(message("cloud_debug.run_configuration.dotnet.start_command.assembly_path_not_valid", "invalid_path"))
    }
}
