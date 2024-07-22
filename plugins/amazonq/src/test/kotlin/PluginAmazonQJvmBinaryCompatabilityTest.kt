// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class PluginAmazonQJvmBinaryCompatabilityTest {
    @Test
    fun `AuthController is available`() {
        // v1.0.133.0 of internal plugin
        // $ javap -c -classpath aws-toolkit-amazonq-2024.1.jar <...>.amazonq.AmazonQConnectionService
        //   public final boolean isAuthenticated();
        //       0: new           #27                 // class software/aws/toolkits/jetbrains/services/amazonq/auth/AuthController
        //       4: invokespecial #28                 // Method software/aws/toolkits/jetbrains/services/amazonq/auth/AuthController."<init>":()V
        //      11: invokevirtual #32                 // Method software/aws/toolkits/jetbrains/services/amazonq/auth/AuthController.getAuthNeededStates:(Lcom/intellij/openapi/project/Project;)Lsoftware/aws/toolkits/jetbrains/services/amazonq/auth/AuthNeededStates;
        //      16: invokevirtual #38                 // Method software/aws/toolkits/jetbrains/services/amazonq/auth/AuthNeededStates.getAmazonQ:()Lsoftware/aws/toolkits/jetbrains/services/amazonq/auth/AuthNeededState;

        // not really sure if they should be using AuthController to check this...
        val authControllerClazz = Class.forName("software.aws.toolkits.jetbrains.services.amazonq.auth.AuthController")
        val authNeededStatesClazz = Class.forName("software.aws.toolkits.jetbrains.services.amazonq.auth.AuthNeededStates")

        // AuthController()
        assertThat(authControllerClazz.getConstructor().canAccess(null)).isTrue()

        // AuthController#getAuthNeededStates
        assertThat(authControllerClazz.getMethod("getAuthNeededStates", Class.forName("com.intellij.openapi.project.Project")).returnType).isEqualTo(authNeededStatesClazz)
        // AuthNeededStates#getAmazonQ
        assertThat(authNeededStatesClazz.getMethod("getAmazonQ").returnType).isEqualTo(Class.forName("software.aws.toolkits.jetbrains.services.amazonq.auth.AuthNeededState"))
    }

    @Test
    fun `CodeWhisperer customization classes are available`() {
        // v1.0.133.0 of internal plugin
        // $ javap -c -classpath aws-toolkit-amazonq-2024.1.jar <...>.amazonq.AmazonQConfigurationServiceKt
        //   public static final software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererCustomization findCustomizationToUse(java.util.List<software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererCustomization>);
        //      45: getfield      #40                 // Field software/aws/toolkits/jetbrains/services/codewhisperer/customization/CodeWhispererCustomization.arn:Ljava/lang/String;
        //      58: getfield      #49                 // Field software/aws/toolkits/jetbrains/services/codewhisperer/customization/CodeWhispererCustomization.name:Ljava/lang/String;

        //   public static final void setCustomization(com.intellij.openapi.project.Project);
        //       6: getstatic     #72                 // Field migration/software/aws/toolkits/jetbrains/services/codewhisperer/customization/CodeWhispererModelConfigurator.Companion:Lmigration/software/aws/toolkits/jetbrains/services/codewhisperer/customization/CodeWhispererModelConfigurator$Companion;
        //       9: invokevirtual #78                 // Method migration/software/aws/toolkits/jetbrains/services/codewhisperer/customization/CodeWhispererModelConfigurator$Companion.getInstance:()Lmigration/software/aws/toolkits/jetbrains/services/codewhisperer/customization/CodeWhispererModelConfigurator;
        //      19: invokestatic  #82                 // InterfaceMethod migration/software/aws/toolkits/jetbrains/services/codewhisperer/customization/CodeWhispererModelConfigurator.listCustomizations$default:(Lmigration/software/aws/toolkits/jetbrains/services/codewhisperer/customization/CodeWhispererModelConfigurator;Lcom/intellij/openapi/project/Project;ZILjava/lang/Object;)Ljava/util/List;
        //      106: invokevirtual #106                // Method software/aws/toolkits/jetbrains/services/codewhisperer/customization/CustomizationUiItem.getCustomization:()Lsoftware/aws/toolkits/jetbrains/services/codewhisperer/customization/CodeWhispererCustomization;
        //      140: invokeinterface #118,  3          // InterfaceMethod migration/software/aws/toolkits/jetbrains/services/codewhisperer/customization/CodeWhispererModelConfigurator.switchCustomization:(Lcom/intellij/openapi/project/Project;Lsoftware/aws/toolkits/jetbrains/services/codewhisperer/customization/CodeWhispererCustomization;)V

        // CodeWhispererModelConfigurator.getInstance()
        assertThat(Class.forName("migration.software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator\$Companion").getMethod("getInstance").returnType)
            .isEqualTo(Class.forName("migration.software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator"))

        val modelConfiguratorClazz = Class.forName("migration.software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator")
        // CodeWhispererModelConfigurator.listCustomizations(...)
        // type erasure :/
        assertThat(
            modelConfiguratorClazz.getMethod(
                "listCustomizations\$default",
                modelConfiguratorClazz,
                Class.forName("com.intellij.openapi.project.Project"),
                // can't request primitive type using reflection
                java.lang.Boolean.TYPE,
                Integer.TYPE,
                Class.forName("java.lang.Object")
            ).returnType
        ).isEqualTo(Class.forName("java.util.List"))

        // CodeWhispererCustomization fields
        val customizationClazz = Class.forName("software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererCustomization")
        assertThat(customizationClazz.getField("arn").type).isEqualTo(Class.forName("java.lang.String"))
        assertThat(customizationClazz.getField("name").type).isEqualTo(Class.forName("java.lang.String"))

        // field CustomizationUiItem.customization
        val customizationUiItem = Class.forName("software.aws.toolkits.jetbrains.services.codewhisperer.customization.CustomizationUiItem")
        assertThat(customizationUiItem.getMethod("getCustomization").returnType).isEqualTo(customizationClazz)

        // CodeWhispererModelConfigurator.switchCustomization(...)
        assertThat(modelConfiguratorClazz.getMethod("switchCustomization", Class.forName("com.intellij.openapi.project.Project"), customizationClazz).returnType).isEqualTo(Void.TYPE)
    }
}
