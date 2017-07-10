package com.amazonaws.intellij.credentials

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.auth.DefaultAWSCredentialsProviderChain
import com.intellij.openapi.options.UnnamedConfigurable
import org.jdom.Element

const val DEFAULT_PROVIDER_ID = "defaultChain";

class DefaultChainCredentialProvider : CredentialProvider() {
    override val name: String
        get() = "Default AWS Credential Chain"

    override val id: String
        get() = DEFAULT_PROVIDER_ID

    override val configurable: UnnamedConfigurable?
        get() = null

    override val awsCredentials: AWSCredentialsProvider
        get() = DefaultAWSCredentialsProviderChain();

    override fun save(element: Element) {
        // NO-OP
    }

    override fun load(element: Element) {
        // NO-OP
    }
}

class DefaultChainCredentialProviderFactory : CredentialProviderFactory<DefaultChainCredentialProvider>() {
    override fun getInstance(): DefaultChainCredentialProviderFactory {
        return this
    }

    override fun getKey(): String {
        return DEFAULT_PROVIDER_ID;
    }

    override fun createProvider(): DefaultChainCredentialProvider {
        return DefaultChainCredentialProvider()
    }
}