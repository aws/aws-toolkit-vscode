// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.lang.java.JavaLanguage
import com.intellij.xdebugger.XDebugProcessStarter
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.ImageDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState

abstract class JavaImageDebugSupport : ImageDebugSupport {
    override fun supportsPathMappings(): Boolean = true
    override val languageId = JavaLanguage.INSTANCE.id
    override suspend fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugHost: String,
        debugPorts: List<Int>
    ): XDebugProcessStarter? = JavaDebugUtils.createDebugProcess(environment, state, debugHost, debugPorts)
}

open class Java8ImageDebugSupport : JavaImageDebugSupport() {
    override val id: String = LambdaRuntime.JAVA8.toString()
    override fun displayName() = LambdaRuntime.JAVA8.toString().capitalize()
    override fun containerEnvVars(debugPorts: List<Int>): Map<String, String> = mapOf(
        "_JAVA_OPTIONS" to "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=${debugPorts.first()} " +
            "-XX:MaxHeapSize=2834432k -XX:MaxMetaspaceSize=163840k -XX:ReservedCodeCacheSize=81920k -XX:+UseSerialGC " +
            "-XX:-TieredCompilation -Djava.net.preferIPv4Stack=true -Xshare:off"
    )
}

class Java8Al2ImageDebugSupport : Java8ImageDebugSupport() {
    override val id: String = LambdaRuntime.JAVA8_AL2.toString()
    override fun displayName() = LambdaRuntime.JAVA8_AL2.toString().capitalize()
}

open class Java11ImageDebugSupport : JavaImageDebugSupport() {
    override val id: String = LambdaRuntime.JAVA11.toString()
    override fun displayName() = LambdaRuntime.JAVA11.toString().capitalize()
    override fun containerEnvVars(debugPorts: List<Int>): Map<String, String> = mapOf(
        "_JAVA_OPTIONS" to "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=*:${debugPorts.first()} " +
            "-XX:MaxHeapSize=2834432k -XX:MaxMetaspaceSize=163840k -XX:ReservedCodeCacheSize=81920k -XX:+UseSerialGC " +
            "-XX:-TieredCompilation -Djava.net.preferIPv4Stack=true"
    )
}
