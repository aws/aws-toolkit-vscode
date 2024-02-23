// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import com.intellij.testFramework.ApplicationExtension
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.junit.jupiter.api.extension.RegisterExtension
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoInteractions
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClientBuilder
import software.aws.toolkits.jetbrains.utils.rules.RegistryExtension
import java.net.URI

@ExtendWith(ApplicationExtension::class)
class CawsClientCustomizerTest {
    @JvmField
    @RegisterExtension
    val registryExtension = RegistryExtension()

    private val registryKey = "aws.codecatalyst.endpoint"

    @Test
    fun `empty registry does not override`() {
        registryExtension.setValue(registryKey, "")

        val mock = mock<CodeCatalystClientBuilder>()
        CawsClientCustomizer().customize(
            null,
            null,
            "",
            mock,
            mock()
        )

        verifyNoInteractions(mock)
    }

    @Test
    fun `spaces in registry does not override`() {
        registryExtension.setValue(registryKey, "              ")

        val mock = mock<CodeCatalystClientBuilder>()
        CawsClientCustomizer().customize(
            null,
            null,
            "",
            mock,
            mock()
        )

        verifyNoInteractions(mock)
    }

    @Test
    fun `can override through registry`() {
        registryExtension.setValue(registryKey, "https://example.com")

        val mock = mock<CodeCatalystClientBuilder>()
        CawsClientCustomizer().customize(
            null,
            null,
            "",
            mock,
            mock()
        )

        verify(mock).endpointOverride(eq(URI.create("https://example.com")))
    }

    @Test
    fun `ignores URI without scheme`() {
        registryExtension.setValue(registryKey, "kjdfajkl;afdsjklfads.csd")

        val mock = mock<CodeCatalystClientBuilder>()
        CawsClientCustomizer().customize(
            null,
            null,
            "",
            mock,
            mock()
        )

        verifyNoInteractions(mock)
    }

    @Test
    fun `ignores URI without authority`() {
        registryExtension.setValue(registryKey, "https://")

        val mock = mock<CodeCatalystClientBuilder>()
        CawsClientCustomizer().customize(
            null,
            null,
            "",
            mock,
            mock()
        )

        verifyNoInteractions(mock)
    }
}
