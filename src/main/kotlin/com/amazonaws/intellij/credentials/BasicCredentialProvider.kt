package com.amazonaws.intellij.credentials

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.auth.AWSStaticCredentialsProvider
import com.amazonaws.auth.BasicAWSCredentials
import com.amazonaws.intellij.ui.credentials.BasicCredentialsPanel
import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.SERVICE_NAME_PREFIX
import com.intellij.credentialStore.isFulfilled
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.options.UnnamedConfigurable
import org.jdom.Element

const val BASIC_PROVIDER_ID = "basicCredentials"

class BasicCredentialProvider : CredentialProvider() {
    var accessKey: String = ""
    var secretKey: String = ""

    override val name: String
        get() = "Basic AWS Credentials"

    override val id: String
        get() = BASIC_PROVIDER_ID

    override val configurable: UnnamedConfigurable?
        get() = BasicCredentialsPanel(this);

    override val awsCredentials: AWSCredentialsProvider
        get() = AWSStaticCredentialsProvider(BasicAWSCredentials(accessKey, secretKey));

    override fun save(element: Element) {
        PasswordSafe.getInstance().setPassword(credentialAttributes(), secretKey)
    }

    override fun load(element: Element) {
        val credentials = PasswordSafe.getInstance().get(credentialAttributes())
        if(credentials != null && credentials.isFulfilled()) {
            accessKey = credentials.userName!!
            secretKey = credentials.getPasswordAsString()!!
        }
    }

    private fun credentialAttributes() = CredentialAttributes(SERVICE_NAME, accessKey)

    companion object {
        val SERVICE_NAME = "$SERVICE_NAME_PREFIX — AWS Credentials"
    }
}

class BasicCredentialProviderFactory : CredentialProviderFactory<BasicCredentialProvider>() {
    override fun getInstance(): BasicCredentialProviderFactory {
        return this;
    }

    override fun getKey(): String {
        return BASIC_PROVIDER_ID;
    }

    override fun createProvider(): BasicCredentialProvider {
        return BasicCredentialProvider()
    }
}