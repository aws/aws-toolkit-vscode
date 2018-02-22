@file:Suppress("DEPRECATION") //TODO when StaticCredentialsProvider is removed this can be removed

package software.aws.toolkits.jetbrains.core

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.auth.BasicAWSCredentials
import com.amazonaws.internal.StaticCredentialsProvider
import software.aws.toolkits.jetbrains.core.credentials.AwsCredentialsProfileProvider
import software.aws.toolkits.jetbrains.core.credentials.CredentialProfile
import software.aws.toolkits.jetbrains.core.region.AwsRegion
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction
import software.aws.toolkits.jetbrains.utils.MutableMapWithListener

class TestAwsResourceCache : AwsResourceCache {
    override fun lambdaFunctions(): List<LambdaFunction> = emptyList()
}

class TestAwsSettingsProvider : AwsSettingsProvider {

    override var currentProfile: CredentialProfile? = MockCredentialProfile

    override var currentRegion: AwsRegion = AwsRegion.GLOBAL

    override fun addListener(listener: SettingsChangedListener): AwsSettingsProvider {
        throw NotImplementedError()
    }
}

class TestAwsCredentialsProfileProvider : AwsCredentialsProfileProvider {
    override var selectedProfile: CredentialProfile?
        get() = throw NotImplementedError()
        set(value) {}
    override var credentialFileLocation: String?
        get() = throw NotImplementedError()
        set(value) {}

    override fun getProfiles(): List<CredentialProfile> {
        throw NotImplementedError()
    }

    override fun lookupProfileByName(name: String): CredentialProfile? = MockCredentialProfile

    override fun addProfileChangeListener(listener: MutableMapWithListener.MapChangeListener<String, CredentialProfile>) {
        throw NotImplementedError()
    }

    override fun setProfiles(profiles: List<CredentialProfile>) {
        throw NotImplementedError()
    }
}

object MockCredentialProfile : CredentialProfile() {
    init {
        name = "testprofile"
    }

    override val awsCredentials: AWSCredentialsProvider get() = StaticCredentialsProvider(BasicAWSCredentials("hello", "world"))
    override val id: String get() = "mock"
}