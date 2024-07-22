// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class PluginCoreJvmBinaryCompatabilityTest {
    @Test
    fun `loginSso JVM signature is stable`() {
        // v1.0.133.0 of internal plugin
        // $ javap -c -classpath aws-toolkit-amazonq-2024.1.jar <...>.amazonq.AmazonQConnectionService
        //   public final void authenticateInternal$aws_toolkit_amazonq(kotlin.jvm.functions.Function1<? super java.lang.Boolean, kotlin.Unit>);
        //       38: invokestatic  #110                // Method software/aws/toolkits/jetbrains/core/credentials/ToolkitAuthManagerKt.loginSso$default:(
        //           Lcom/intellij/openapi/project/Project;
        //           Ljava/lang/String;Ljava/lang/String;
        //           Ljava/util/List;
        //           Lkotlin/jvm/functions/Function1;
        //           Lkotlin/jvm/functions/Function1;
        //           Lkotlin/jvm/functions/Function0;
        //           Lsoftware/aws/toolkits/jetbrains/core/credentials/ConnectionMetadata;
        //           I
        //           Ljava/lang/Object;
        //       )Lsoftware/aws/toolkits/jetbrains/core/credentials/AwsBearerTokenConnection;

        // loginSso(...)
        val clazz = Class.forName("software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManagerKt")
        val method = clazz.getDeclaredMethod(
            "loginSso\$default",
            Class.forName("com.intellij.openapi.project.Project"),
            Class.forName("java.lang.String"),
            Class.forName("java.lang.String"),
            Class.forName("java.util.List"),
            Class.forName("kotlin.jvm.functions.Function1"),
            Class.forName("kotlin.jvm.functions.Function1"),
            Class.forName("kotlin.jvm.functions.Function0"),
            Class.forName("software.aws.toolkits.jetbrains.core.credentials.ConnectionMetadata"),
            // can't request primitive type using reflection
            Integer.TYPE,
            Class.forName("java.lang.Object"),
        )

        assertThat(method.returnType).isEqualTo(Class.forName("software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection"))
    }

    @Test
    fun `scope static values are available`() {
        // v1.0.133.0 of internal plugin
        // $ javap -c -classpath aws-toolkit-amazonq-2024.1.jar <...>.amazonq.AmazonQConnectionService
        //   public final void authenticateInternal$aws_toolkit_amazonq(kotlin.jvm.functions.Function1<? super java.lang.Boolean, kotlin.Unit>);
        //      15: invokestatic  #91                 // Method software/aws/toolkits/jetbrains/core/credentials/sono/SonoConstantsKt.getCODEWHISPERER_SCOPES:()Ljava/util/List;
        //      21: invokestatic  #96                 // Method software/aws/toolkits/jetbrains/core/credentials/sono/SonoConstantsKt.getQ_SCOPES:()Ljava/util/List;

        // not sure why CODEWHISPERER_SCOPES is being used when Q_SCOPES is a superset
        val clazz = Class.forName("software.aws.toolkits.jetbrains.core.credentials.sono.SonoConstantsKt")

        // type erasure :/
        assertThat(clazz.getMethod("getCODEWHISPERER_SCOPES").invoke(null)).isInstanceOf(List::class.java)
        assertThat(clazz.getMethod("getQ_SCOPES").invoke(null)).isInstanceOf(List::class.java)
    }
}
