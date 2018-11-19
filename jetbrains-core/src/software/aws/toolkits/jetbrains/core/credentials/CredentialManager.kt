// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.util.Disposer
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderManager

interface CredentialManager {
    @Throws(CredentialProviderNotFound::class)
    fun getCredentialProvider(providerId: String): ToolkitCredentialsProvider

    fun getCredentialProviders(): List<ToolkitCredentialsProvider>

    companion object {
        fun getInstance(): CredentialManager = ServiceManager.getService(CredentialManager::class.java)
    }
}

class DefaultCredentialManager : CredentialManager, Disposable {
    private val toolkitCredentialManager =
        ToolkitCredentialsProviderManager(ExtensionPointCredentialsProviderRegistry())

    init {
        Disposer.register(ApplicationManager.getApplication(), this)
    }

    @Throws(CredentialProviderNotFound::class)
    override fun getCredentialProvider(providerId: String): ToolkitCredentialsProvider =
        toolkitCredentialManager.getCredentialProvider(providerId)

    override fun getCredentialProviders(): List<ToolkitCredentialsProvider> =
        toolkitCredentialManager.getCredentialProviders()

    override fun dispose() {
        toolkitCredentialManager.shutDown()
    }
}

fun AwsCredentials.toEnvironmentVariables(): Map<String, String> {
    val map = mutableMapOf<String, String>()
    map["AWS_ACCESS_KEY"] = this.accessKeyId()
    map["AWS_ACCESS_KEY_ID"] = this.accessKeyId()
    map["AWS_SECRET_KEY"] = this.secretAccessKey()
    map["AWS_SECRET_ACCESS_KEY"] = this.secretAccessKey()

    if (this is AwsSessionCredentials) {
        map["AWS_SESSION_TOKEN"] = this.sessionToken()
        map["AWS_SECURITY_TOKEN"] = this.sessionToken()
    }

    return map
}