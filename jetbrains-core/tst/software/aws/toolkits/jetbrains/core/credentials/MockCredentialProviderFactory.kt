// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.PlatformTestUtil
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderFactory
import kotlin.reflect.jvm.jvmName

class MockCredentialProviderFactory : CredentialProviderFactory {
    override fun createToolkitCredentialProviderFactory(): ToolkitCredentialsProviderFactory {
        return INSTANCE
    }

    companion object {
        val INSTANCE = MockToolkitCredentialProviderFactory()
        fun registerExtension(disposable: Disposable) {
            PlatformTestUtil.registerExtension(
                ExtensionPointCredentialsProviderRegistry.EXTENSION_POINT,
                CredentialProviderFactoryEP().apply {
                    this.implementation = MockCredentialProviderFactory::class.jvmName
                },
                disposable
            )

            Disposer.register(disposable, Disposable { INSTANCE.reset() })
        }
    }

    class MockToolkitCredentialProviderFactory : ToolkitCredentialsProviderFactory("Mocks") {
        fun createMockCredentials(id: String): ToolkitCredentialsProvider {
            val mockProvider = object : ToolkitCredentialsProvider() {
                override val id: String
                    get() = id

                override val displayName: String
                    get() = id

                override fun resolveCredentials(): AwsCredentials = throw NotImplementedError()
            }
            add(mockProvider)
            return mockProvider
        }

        internal fun reset() {
            clear()
        }
    }
}