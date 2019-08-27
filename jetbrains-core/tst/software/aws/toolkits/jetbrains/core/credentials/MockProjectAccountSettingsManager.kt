// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager.Companion.createDummyProvider
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

class MockProjectAccountSettingsManager : ProjectAccountSettingsManager {
    private var internalProvider: ToolkitCredentialsProvider? = DUMMY_PROVIDER
    private val recentlyUsedRegions = mutableListOf<AwsRegion>()
    private val recentlyUsedCredentials = mutableListOf<ToolkitCredentialsProvider>()

    override var activeRegion = AwsRegionProvider.getInstance().defaultRegion()

    override val activeCredentialProvider: ToolkitCredentialsProvider
        get() = internalProvider ?: throw CredentialProviderNotFound("boom")

    override fun recentlyUsedRegions(): List<AwsRegion> = recentlyUsedRegions

    override fun recentlyUsedCredentials(): List<ToolkitCredentialsProvider> = recentlyUsedCredentials

    override fun changeCredentialProvider(credentialsProvider: ToolkitCredentialsProvider?) {
        internalProvider = credentialsProvider
        credentialsProvider?.let {
            recentlyUsedCredentials.add(credentialsProvider)
        }
    }

    override fun changeRegion(region: AwsRegion) {
        activeRegion = region
        recentlyUsedRegions.add(region)
    }

    fun reset() {
        internalProvider = DUMMY_PROVIDER
        activeRegion = AwsRegionProvider.getInstance().defaultRegion()
        recentlyUsedRegions.clear()
        recentlyUsedCredentials.clear()
    }

    companion object {
        private val DUMMY_PROVIDER = createDummyProvider(
            "MockCredentials",
            AwsBasicCredentials.create("Foo", "Bar")
        )

        fun createDummyProvider(id: String, awsCredentials: AwsCredentials) = object : ToolkitCredentialsProvider() {
            override val id = id
            override val displayName = id

            override fun resolveCredentials(): AwsCredentials = awsCredentials
        }

        fun getInstance(project: Project): MockProjectAccountSettingsManager =
            ServiceManager.getService(
                project,
                ProjectAccountSettingsManager::class.java
            ) as MockProjectAccountSettingsManager
    }
}

fun <T> runUnderRealCredentials(project: Project, block: () -> T): T {
    val credentials = DefaultCredentialsProvider.create().resolveCredentials()
    val manager = MockProjectAccountSettingsManager.getInstance(project)
    val oldActive = manager.activeCredentialProvider
    try {
        println("Running using real credentials")
        manager.changeCredentialProvider(createDummyProvider("RealCreds", credentials))
        return block.invoke()
    } finally {
        manager.changeCredentialProvider(oldActive)
    }
}