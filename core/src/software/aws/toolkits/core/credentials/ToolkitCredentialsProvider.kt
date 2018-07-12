package software.aws.toolkits.core.credentials

import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider

interface ToolkitCredentialsProvider : AwsCredentialsProvider {
    /**
     * The ID should be unique across all [ToolkitCredentialsProvider].
     * It is recommended to concatenate the factory type and the display name.
     */
    val id: String

    /**
     * A user friendly display name shown in the UI.
     */
    val displayName: String
}

/**
 * The class for managing [ToolkitCredentialsProvider] of the same type.
 * @property type The internal ID for this type of [ToolkitCredentialsProvider], eg 'profile' for AWS account whose credentials is stored in the profile file.
 */
abstract class ToolkitCredentialsProviderFactory(
    val type: String
) {
    private val tcps = mutableMapOf<String, ToolkitCredentialsProvider>()

    protected fun add(provider: ToolkitCredentialsProvider) {
        tcps[provider.id] = provider
    }

    protected fun clear() {
        tcps.clear()
    }

    fun listCredentialProviders() = tcps.values

    fun get(id: String) = tcps[id]

    /**
     * Called when the [ToolkitCredentialsProviderManager] is shutting down to allow for resource clean up
     */
    open fun shutDown() {}
}